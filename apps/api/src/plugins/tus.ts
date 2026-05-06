import type { FastifyPluginAsync } from 'fastify';
import { Server as TusServer } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { nanoid } from 'nanoid';
import { getDb, assets, auditLog } from '../db/index.js';
import {
  getQueue,
  QUEUE_NAMES,
  type MetadataJobData,
  type TranscodeJobData,
  type ThumbnailJobData,
  type TranscribeJobData,
} from '../lib/queue.js';
import { env } from '../lib/config.js';
import { getAuth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export const tusPlugin: FastifyPluginAsync = async (app) => {
  const config = env();

  app.log.info({
    wasabiBucket: config.WASABI_BUCKET,
    wasabiRegion: config.WASABI_REGION,
    wasabiEndpoint: config.WASABI_ENDPOINT,
    hasAccessKey: !!config.WASABI_ACCESS_KEY_ID,
    hasSecretKey: !!config.WASABI_SECRET_ACCESS_KEY,
  }, 'tus: initializing S3Store');

  const s3Store = new S3Store({
    s3ClientConfig: {
      bucket: config.WASABI_BUCKET,
      region: config.WASABI_REGION,
      endpoint: config.WASABI_ENDPOINT,
      credentials: {
        accessKeyId: config.WASABI_ACCESS_KEY_ID,
        secretAccessKey: config.WASABI_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    },
  });

  const tusServer = new TusServer({
    path: '/api/upload',
    datastore: s3Store,
    maxSize: 50 * 1024 * 1024 * 1024, // 50GB max
    generateUrl(req, { proto, host, path, id }) {
      // base64url encode because the ID contains slashes (originals/{assetId}/{filename})
      id = Buffer.from(id, 'utf-8').toString('base64url');
      return `${proto}://${host}${path}/${id}`;
    },
    getFileIdFromRequest(req, lastPath) {
      if (!lastPath) return undefined;
      return Buffer.from(lastPath, 'base64url').toString('utf-8');
    },
    namingFunction(req, metadata) {
      const assetId = nanoid();
      const filename = metadata?.filename || 'unknown';
      return `originals/${assetId}/${filename}`;
    },
    async onUploadCreate(req, res, upload) {
      try {
        // Require an authenticated user (admin/editor) to upload.
        // viewers can browse but not upload.
        const auth = getAuth();
        const sessionResult = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        const sessionUser = sessionResult?.user;
        if (!sessionUser) {
          throw { status_code: 401, body: 'Authentication required to upload\n' };
        }
        if (sessionUser.role !== 'admin' && sessionUser.role !== 'editor') {
          throw { status_code: 403, body: 'Editor or admin role required to upload\n' };
        }

        // Create asset record in database
        const db = getDb();
        const metadata = upload.metadata || {};
        const filename = metadata.filename || 'unknown';
        const mimeType = metadata.filetype || 'video/mp4';
        const versionOf = metadata.version_of; // optional: id of an existing asset

        const assetId = upload.id.split('/')[1]; // Extract from originals/{assetId}/{filename}

        // Default: this is a v1 standalone asset, group id = its own id
        let versionGroupId = assetId;
        let versionNumber = 1;
        let title = filename.replace(/\.[^/.]+$/, '');

        if (versionOf) {
          const { eq, and } = await import('drizzle-orm');
          // Find the parent asset
          const parent = await db.query.assets.findFirst({
            where: eq(assets.id, versionOf),
          });
          if (parent) {
            versionGroupId = parent.versionGroupId ?? parent.id;
            // Inherit title and any custom metadata fields from the parent
            title = parent.title;

            // Backfill the parent's versionGroupId if it was null
            if (!parent.versionGroupId) {
              await db
                .update(assets)
                .set({ versionGroupId })
                .where(eq(assets.id, parent.id));
            }

            // Find max version in this group
            const groupAssets = await db
              .select()
              .from(assets)
              .where(eq(assets.versionGroupId, versionGroupId));
            versionNumber = Math.max(
              ...groupAssets.map((a) => a.versionNumber ?? 1),
              parent.versionNumber ?? 1
            ) + 1;

            // Mark all existing versions in the group as not latest
            await db
              .update(assets)
              .set({ isLatestVersion: false })
              .where(
                and(
                  eq(assets.versionGroupId, versionGroupId),
                  eq(assets.isLatestVersion, true)
                )
              );
          }
        }

        app.log.info(
          {
            assetId,
            filename,
            mimeType,
            uploadId: upload.id,
            userId: sessionUser.id,
            versionGroupId,
            versionNumber,
          },
          'tus: onUploadCreate'
        );

        await db.insert(assets).values({
          id: assetId,
          title,
          originalFilename: filename,
          mimeType,
          fileSize: upload.size || 0,
          status: 'uploading',
          storageKey: upload.id,
          versionGroupId,
          versionNumber,
          isLatestVersion: true,
          createdBy: sessionUser.id,
        });

        return res;
      } catch (err) {
        app.log.error({ err }, 'tus: onUploadCreate failed');
        throw err;
      }
    },
    onResponseError(req, res, err) {
      app.log.error({ err, method: req.method, url: req.url }, 'tus: response error');
      return undefined;
    },
    async onUploadFinish(req, res, upload) {
      // Upload complete - queue processing jobs
      const assetId = upload.id.split('/')[1];
      const db = getDb();
      const { eq } = await import('drizzle-orm');

      // Look up the asset's owner so we can attribute the audit entry
      const existing = await db.query.assets.findFirst({
        where: eq(assets.id, assetId),
      });

      // Update status to processing
      await db
        .update(assets)
        .set({ status: 'processing', fileSize: upload.offset || 0 })
        .where(eq(assets.id, assetId));

      // Audit
      if (existing) {
        await db.insert(auditLog).values({
          action: 'upload',
          entityType: 'asset',
          entityId: assetId,
          userId: existing.createdBy,
          details: {
            filename: existing.originalFilename,
            fileSize: upload.offset || 0,
          },
        });
      }

      // Queue metadata extraction first
      const metadataQueue = getQueue(QUEUE_NAMES.METADATA);
      await metadataQueue.add('extract', {
        assetId,
        inputKey: upload.id,
      } satisfies MetadataJobData);

      // Queue thumbnail generation
      const thumbnailQueue = getQueue(QUEUE_NAMES.THUMBNAIL);
      await thumbnailQueue.add('generate', {
        assetId,
        inputKey: upload.id,
      } satisfies ThumbnailJobData);

      // Queue transcoding
      const transcodeQueue = getQueue(QUEUE_NAMES.TRANSCODE);
      await transcodeQueue.add('proxy', {
        assetId,
        inputKey: upload.id,
        profile: 'proxy',
      } satisfies TranscodeJobData);

      await transcodeQueue.add('hls', {
        assetId,
        inputKey: upload.id,
        profile: 'hls',
      } satisfies TranscodeJobData);

      // Queue transcription
      const transcribeQueue = getQueue(QUEUE_NAMES.TRANSCRIBE);
      await transcribeQueue.add('transcribe', {
        assetId,
        inputKey: upload.id,
      } satisfies TranscribeJobData);

      return res;
    },
  });

  // Accept tus content types that Fastify doesn't know about
  app.addContentTypeParser('application/offset+octet-stream', (_req, _payload, done) => {
    done(null);
  });

  // Handle tus requests - reply.raw is managed by tus server directly
  app.all('/api/upload', (request, reply) => {
    tusServer.handle(request.raw, reply.raw).catch((err) => {
      app.log.error({ err }, 'tus upload error');
    });
    reply.hijack();
  });

  app.all('/api/upload/*', (request, reply) => {
    tusServer.handle(request.raw, reply.raw).catch((err) => {
      app.log.error({ err }, 'tus upload error');
    });
    reply.hijack();
  });
};
