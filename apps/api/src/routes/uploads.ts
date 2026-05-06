import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { getDb, assets, auditLog } from '../db/index.js';
import { getS3Client, getBucket } from '../lib/storage.js';
import { requireRole } from '../plugins/session.js';
import {
  getQueue,
  QUEUE_NAMES,
  type MetadataJobData,
  type ThumbnailJobData,
  type TranscodeJobData,
  type TranscribeJobData,
} from '../lib/queue.js';

const PART_URL_TTL = 6 * 60 * 60; // 6h - enough for huge files
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

interface InitBody {
  filename: string;
  mimeType: string;
  fileSize: number;
  partSize: number; // bytes per part
  versionOf?: string; // optional id of an asset to add a new version to
}

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Step 1: client tells us what they want to upload, we create a multipart
   * upload on Wasabi and return presigned URLs for every part. The browser
   * uploads parts in parallel directly to Wasabi.
   */
  app.post('/init', async (request, reply) => {
    const me = requireRole(request, 'admin', 'editor');
    const body = request.body as InitBody;

    if (!body.filename || !body.mimeType || !body.fileSize || !body.partSize) {
      return reply.status(400).send({
        error: 'filename, mimeType, fileSize and partSize are required',
      });
    }
    if (body.fileSize > MAX_FILE_SIZE) {
      return reply.status(400).send({ error: 'File too large (max 50GB)' });
    }
    if (body.partSize < 5 * 1024 * 1024) {
      return reply.status(400).send({ error: 'partSize must be at least 5MB' });
    }

    const db = getDb();
    const s3 = getS3Client();
    const bucket = getBucket();

    const assetId = nanoid();
    const filename = body.filename;
    const key = `originals/${assetId}/${filename}`;

    // Resolve versioning if this is a new version of an existing asset
    let versionGroupId: string = assetId;
    let versionNumber = 1;
    let title = filename.replace(/\.[^/.]+$/, '');

    if (body.versionOf) {
      const parent = await db.query.assets.findFirst({
        where: eq(assets.id, body.versionOf),
      });
      if (parent) {
        versionGroupId = parent.versionGroupId ?? parent.id;
        title = parent.title;
      }
    }

    // Create the multipart upload on Wasabi
    const create = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: body.mimeType,
      })
    );

    if (!create.UploadId) {
      return reply.status(500).send({ error: 'Failed to start multipart upload' });
    }

    // How many parts do we need?
    const numParts = Math.ceil(body.fileSize / body.partSize);
    if (numParts > 10000) {
      return reply.status(400).send({
        error: 'Too many parts. Increase partSize.',
      });
    }

    // Generate a presigned URL for each part
    const partUrls = await Promise.all(
      Array.from({ length: numParts }, (_, i) => i + 1).map(async (partNumber) => {
        const cmd = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: create.UploadId!,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(s3, cmd, { expiresIn: PART_URL_TTL });
        return { partNumber, url };
      })
    );

    // Stash the asset row up front so the UI can show it
    await db.insert(assets).values({
      id: assetId,
      title,
      originalFilename: filename,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      status: 'uploading',
      storageKey: key,
      versionGroupId,
      versionNumber,
      isLatestVersion: true,
      createdBy: me.id,
    });

    return {
      assetId,
      uploadId: create.UploadId,
      key,
      partUrls,
      partSize: body.partSize,
    };
  });

  /**
   * Step 2: client tells us the parts have all uploaded successfully along
   * with the ETags Wasabi gave them. We complete the multipart upload and
   * kick off processing.
   */
  app.post('/complete', async (request, reply) => {
    requireRole(request, 'admin', 'editor');
    const body = request.body as {
      assetId: string;
      uploadId: string;
      key: string;
      parts: { partNumber: number; etag: string }[];
      versionOf?: string;
    };

    if (!body.assetId || !body.uploadId || !body.key || !body.parts?.length) {
      return reply.status(400).send({ error: 'Missing fields' });
    }

    const db = getDb();
    const s3 = getS3Client();
    const bucket = getBucket();

    // Sort by part number, just in case
    const sortedParts = [...body.parts].sort((a, b) => a.partNumber - b.partNumber);

    try {
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: body.key,
          UploadId: body.uploadId,
          MultipartUpload: {
            Parts: sortedParts.map((p) => ({
              PartNumber: p.partNumber,
              ETag: p.etag,
            })),
          },
        })
      );
    } catch (err) {
      app.log.error({ err }, 'completeMultipartUpload failed');
      return reply.status(500).send({
        error: (err as Error).message ?? 'Failed to complete upload',
      });
    }

    // Resolve versioning - we may need to bump version numbers and mark
    // the previous latest as not-latest. We do this here (after the upload
    // succeeded) so a partial upload doesn't change version state.
    if (body.versionOf) {
      const { eq, and } = await import('drizzle-orm');
      const parent = await db.query.assets.findFirst({
        where: eq(assets.id, body.versionOf),
      });
      if (parent) {
        const versionGroupId = parent.versionGroupId ?? parent.id;
        if (!parent.versionGroupId) {
          await db
            .update(assets)
            .set({ versionGroupId })
            .where(eq(assets.id, parent.id));
        }
        const groupAssets = await db
          .select()
          .from(assets)
          .where(eq(assets.versionGroupId, versionGroupId));
        const versionNumber = Math.max(
          ...groupAssets.map((a) => a.versionNumber ?? 1),
          parent.versionNumber ?? 1
        ) + 1;
        await db
          .update(assets)
          .set({ isLatestVersion: false })
          .where(
            and(
              eq(assets.versionGroupId, versionGroupId),
              eq(assets.isLatestVersion, true)
            )
          );
        await db
          .update(assets)
          .set({ versionGroupId, versionNumber, isLatestVersion: true })
          .where(eq(assets.id, body.assetId));
      }
    }

    // Move asset to processing and look up the user for audit
    const updated = await db
      .update(assets)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(assets.id, body.assetId))
      .returning();

    const asset = updated[0];
    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    // Audit log
    await db.insert(auditLog).values({
      action: 'upload',
      entityType: 'asset',
      entityId: body.assetId,
      userId: asset.createdBy,
      details: { filename: asset.originalFilename, fileSize: asset.fileSize },
      ipAddress: request.ip,
    });

    // Queue the same processing pipeline as the tus path
    const metadataQueue = getQueue(QUEUE_NAMES.METADATA);
    await metadataQueue.add('extract', {
      assetId: body.assetId,
      inputKey: body.key,
    } satisfies MetadataJobData);

    const thumbnailQueue = getQueue(QUEUE_NAMES.THUMBNAIL);
    await thumbnailQueue.add('generate', {
      assetId: body.assetId,
      inputKey: body.key,
    } satisfies ThumbnailJobData);

    const transcodeQueue = getQueue(QUEUE_NAMES.TRANSCODE);
    await transcodeQueue.add('proxy', {
      assetId: body.assetId,
      inputKey: body.key,
      profile: 'proxy',
    } satisfies TranscodeJobData);
    await transcodeQueue.add('hls', {
      assetId: body.assetId,
      inputKey: body.key,
      profile: 'hls',
    } satisfies TranscodeJobData);

    const transcribeQueue = getQueue(QUEUE_NAMES.TRANSCRIBE);
    await transcribeQueue.add('transcribe', {
      assetId: body.assetId,
      inputKey: body.key,
    } satisfies TranscribeJobData);

    return { success: true, assetId: body.assetId };
  });

  /**
   * Step 2b (only if the upload was cancelled): clean up the multipart
   * upload on Wasabi and remove the asset row.
   */
  app.post('/abort', async (request) => {
    requireRole(request, 'admin', 'editor');
    const body = request.body as {
      assetId: string;
      uploadId: string;
      key: string;
    };

    const db = getDb();
    const s3 = getS3Client();
    const bucket = getBucket();

    if (body.uploadId && body.key) {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: body.key,
            UploadId: body.uploadId,
          })
        );
      } catch (err) {
        // Best-effort - the upload might already be gone
        app.log.warn({ err }, 'abort multipart upload failed');
      }
    }

    if (body.assetId) {
      await db.delete(assets).where(eq(assets.id, body.assetId));
    }

    return { success: true };
  });
};
