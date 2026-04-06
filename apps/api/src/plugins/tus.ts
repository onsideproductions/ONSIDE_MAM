import type { FastifyPluginAsync } from 'fastify';
import { Server as TusServer } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { nanoid } from 'nanoid';
import { getDb, assets } from '../db/index.js';
import {
  getQueue,
  QUEUE_NAMES,
  type MetadataJobData,
  type TranscodeJobData,
  type ThumbnailJobData,
} from '../lib/queue.js';
import { env } from '../lib/config.js';

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
        // Create asset record in database
        const db = getDb();
        const metadata = upload.metadata || {};
        const filename = metadata.filename || 'unknown';
        const mimeType = metadata.filetype || 'video/mp4';

        const assetId = upload.id.split('/')[1]; // Extract from originals/{assetId}/{filename}

        app.log.info({ assetId, filename, mimeType, uploadId: upload.id }, 'tus: onUploadCreate');

        await db.insert(assets).values({
          id: assetId,
          title: filename.replace(/\.[^/.]+$/, ''), // Remove extension as default title
          originalFilename: filename,
          mimeType,
          fileSize: upload.size || 0,
          status: 'uploading',
          storageKey: upload.id,
          // createdBy will be set once auth is wired up
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

      // Update status to processing
      await db
        .update(assets)
        .set({ status: 'processing', fileSize: upload.offset || 0 })
        .where(
          (await import('drizzle-orm')).eq(assets.id, assetId)
        );

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
