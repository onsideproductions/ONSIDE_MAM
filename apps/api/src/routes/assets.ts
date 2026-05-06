import type { FastifyPluginAsync } from 'fastify';
import { eq, desc, sql, ilike, and, inArray } from 'drizzle-orm';
import {
  getDb,
  assets,
  tags,
  assetTags,
  aiAnalysis,
  auditLog,
  collections,
  collectionAssets,
} from '../db/index.js';
import {
  getDownloadUrl,
  getStreamUrl,
  getPublicOrSignedUrl,
  deleteFromStorage,
  storageKey,
  getS3Client,
  getBucket,
} from '../lib/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../lib/config.js';
import { requireAuth, requireRole } from '../plugins/session.js';
import {
  getQueue,
  QUEUE_NAMES,
  type TranscodeJobData,
  type ThumbnailJobData,
  type MetadataJobData,
  type AiAnalysisJobData,
} from '../lib/queue.js';

export const assetRoutes: FastifyPluginAsync = async (app) => {
  // List assets with pagination and filtering
  app.get('/', async (request) => {
    const {
      page = 1,
      limit = 24,
      status,
      query,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = request.query as any;

    const db = getDb();
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(eq(assets.status, status));
    if (query) {
      conditions.push(
        sql`(${assets.title} ILIKE ${`%${query}%`} OR ${assets.description} ILIKE ${`%${query}%`})`
      );
    }
    // Only show the latest version of each asset in listings
    conditions.push(eq(assets.isLatestVersion, true));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(assets)
        .where(where)
        .orderBy(sortOrder === 'desc' ? desc(assets.createdAt) : assets.createdAt)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count || 0);

    // Generate thumbnail URLs (CDN if configured, signed otherwise)
    const dataWithUrls = await Promise.all(
      data.map(async (asset) => {
        let thumbnailUrl = null;
        if (asset.thumbnailKey) {
          thumbnailUrl = await getPublicOrSignedUrl(asset.thumbnailKey);
        }
        return { ...asset, thumbnailUrl };
      })
    );

    return {
      data: dataWithUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });

  // Get single asset with tags and AI analysis
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    // Get tags
    const assetTagRows = await db
      .select({ tag: tags })
      .from(assetTags)
      .innerJoin(tags, eq(assetTags.tagId, tags.id))
      .where(eq(assetTags.assetId, id));

    // Get AI analysis
    const analysis = await db.query.aiAnalysis.findFirst({
      where: eq(aiAnalysis.assetId, id),
    });

    // Get all versions in this asset's group (or just self if standalone)
    const groupId = asset.versionGroupId ?? asset.id;
    const versions = await db
      .select({
        id: assets.id,
        versionNumber: assets.versionNumber,
        isLatestVersion: assets.isLatestVersion,
        fileSize: assets.fileSize,
        originalFilename: assets.originalFilename,
        createdAt: assets.createdAt,
        createdBy: assets.createdBy,
      })
      .from(assets)
      .where(
        sql`(${assets.versionGroupId} = ${groupId}) OR (${assets.versionGroupId} IS NULL AND ${assets.id} = ${groupId})`
      )
      .orderBy(desc(assets.versionNumber));

    // Get collections this asset is in
    const inCollections = await db
      .select({ id: collections.id, name: collections.name })
      .from(collectionAssets)
      .innerJoin(collections, eq(collections.id, collectionAssets.collectionId))
      .where(eq(collectionAssets.assetId, id))
      .orderBy(collections.name);

    // Streaming URL: prefer the proxy MP4 (broad browser support, works
    // through CDN). Fall back to HLS only if the proxy isn't ready.
    // When WASABI_PUBLIC_URL is configured, both come straight from the CDN.
    let streamUrl: string | null = null;
    let streamType: 'hls' | 'mp4' | null = null;
    if (asset.proxyKey) {
      streamUrl = await getPublicOrSignedUrl(asset.proxyKey);
      streamType = 'mp4';
    } else if (asset.hlsKey) {
      // With CDN, HLS playlist + segments work directly. Without CDN we
      // need the rewriter endpoint to sign each segment.
      streamUrl = env().WASABI_PUBLIC_URL
        ? await getPublicOrSignedUrl(asset.hlsKey)
        : `/api/assets/${asset.id}/stream.m3u8`;
      streamType = 'hls';
    }

    let thumbnailUrl: string | null = null;
    if (asset.thumbnailKey) {
      thumbnailUrl = await getPublicOrSignedUrl(asset.thumbnailKey);
    }

    return {
      ...asset,
      tags: assetTagRows.map((r) => r.tag),
      aiAnalysis: analysis || null,
      collections: inCollections,
      versions,
      streamUrl,
      streamType,
      thumbnailUrl,
    };
  });

  // Update asset metadata (editor/admin)
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { id } = request.params;
    const { title, description, metadata: meta } = request.body as any;

    const updated = await db
      .update(assets)
      .set({
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(meta && { metadata: meta }),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, id))
      .returning();

    if (!updated.length) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    // Audit log
    await db.insert(auditLog).values({
      action: 'update',
      entityType: 'asset',
      entityId: id,
      details: { title, description },
      ipAddress: request.ip,
    });

    return updated[0];
  });

  // Delete asset (admin only)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireRole(request, 'admin');
    const db = getDb();
    const { id } = request.params;

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    // Delete files from Wasabi
    const keysToDelete = [
      asset.storageKey,
      asset.proxyKey,
      asset.hlsKey,
      asset.thumbnailKey,
      asset.spriteKey,
    ].filter(Boolean) as string[];

    await Promise.allSettled(keysToDelete.map((key) => deleteFromStorage(key)));

    // Delete from DB (cascades to tags, AI analysis)
    await db.delete(assets).where(eq(assets.id, id));

    // Audit log
    await db.insert(auditLog).values({
      action: 'delete',
      entityType: 'asset',
      entityId: id,
      details: { filename: asset.originalFilename },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // Add tags to asset (editor/admin)
  app.post<{ Params: { id: string } }>('/:id/tags', async (request) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { id } = request.params;
    const { tagNames } = request.body as { tagNames: string[] };

    const results = [];
    for (const name of tagNames) {
      // Upsert tag
      const existing = await db.query.tags.findFirst({
        where: eq(tags.name, name.toLowerCase().trim()),
      });

      let tagId: string;
      if (existing) {
        tagId = existing.id;
      } else {
        const [newTag] = await db
          .insert(tags)
          .values({ name: name.toLowerCase().trim() })
          .returning();
        tagId = newTag.id;
      }

      // Link to asset (ignore duplicates)
      await db
        .insert(assetTags)
        .values({ assetId: id, tagId })
        .onConflictDoNothing();

      results.push({ id: tagId, name: name.toLowerCase().trim() });
    }

    return { tags: results };
  });

  // Remove tag from asset (editor/admin)
  app.delete<{ Params: { id: string; tagId: string } }>(
    '/:id/tags/:tagId',
    async (request) => {
      requireRole(request, 'admin', 'editor');
      const db = getDb();
      const { id, tagId } = request.params;

      await db
        .delete(assetTags)
        .where(and(eq(assetTags.assetId, id), eq(assetTags.tagId, tagId)));

      return { success: true };
    }
  );

  // Get download URL for asset (any logged-in user)
  app.get<{ Params: { id: string } }>('/:id/download', async (request, reply) => {
    requireAuth(request);
    const db = getDb();
    const { id } = request.params;
    const { type = 'original' } = request.query as { type?: string };

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    let key: string | null = null;
    let filename = asset.originalFilename;

    switch (type) {
      case 'original':
        key = asset.storageKey;
        break;
      case 'proxy':
        key = asset.proxyKey;
        filename = `proxy_${filename}`;
        break;
      default:
        return reply.status(400).send({ error: 'Invalid download type' });
    }

    if (!key) {
      return reply.status(404).send({ error: 'File not available' });
    }

    const url = await getDownloadUrl(key, 3600, filename);

    // Audit log
    await db.insert(auditLog).values({
      action: 'download',
      entityType: 'asset',
      entityId: id,
      details: { type, filename },
      ipAddress: request.ip,
    });

    return { url, filename };
  });

  // HLS streaming: fetch the master.m3u8 from Wasabi and rewrite every
  // segment line with a presigned URL so the browser can pull segments
  // directly from Wasabi without a session cookie.
  app.get<{ Params: { id: string } }>('/:id/stream.m3u8', async (request, reply) => {
    requireAuth(request);
    const db = getDb();
    const { id } = request.params;

    const asset = await db.query.assets.findFirst({ where: eq(assets.id, id) });
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });
    if (!asset.hlsKey) {
      return reply.status(404).send({ error: 'HLS not available' });
    }

    // Fetch the playlist from Wasabi
    const s3 = getS3Client();
    const result = await s3.send(
      new GetObjectCommand({ Bucket: getBucket(), Key: asset.hlsKey })
    );
    const text = await result.Body?.transformToString();
    if (!text) return reply.status(500).send({ error: 'Empty playlist' });

    // Rewrite non-comment, non-empty lines as presigned URLs.
    // Single-bitrate HLS: lines are either #EXT* directives or "segment_NNN.ts" filenames.
    const baseDir = asset.hlsKey.replace(/\/[^/]+$/, ''); // "hls/{assetId}"
    const rewritten: string[] = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        rewritten.push(rawLine);
        continue;
      }
      // Resolve segment relative to the playlist directory
      const segmentKey = `${baseDir}/${line}`;
      const url = await getStreamUrl(segmentKey, 14400);
      rewritten.push(url);
    }

    reply.header('Content-Type', 'application/vnd.apple.mpegurl');
    // Don't cache - signed URLs are short-lived
    reply.header('Cache-Control', 'no-store');
    return reply.send(rewritten.join('\n'));
  });

  // ---- Bulk operations ----

  // Bulk delete (admin only)
  app.post('/bulk-delete', async (request, reply) => {
    requireRole(request, 'admin');
    const db = getDb();
    const { assetIds } = request.body as { assetIds: string[] };
    if (!assetIds?.length) return { deleted: 0 };

    // Fetch the assets so we can clean up their storage keys
    const toDelete = await db
      .select()
      .from(assets)
      .where(inArray(assets.id, assetIds));

    // Delete files from Wasabi (best-effort)
    const keys = toDelete.flatMap((a) =>
      [a.storageKey, a.proxyKey, a.hlsKey, a.thumbnailKey, a.spriteKey].filter(
        Boolean
      ) as string[]
    );
    await Promise.allSettled(keys.map((k) => deleteFromStorage(k)));

    // Delete from DB (cascades to tags, AI analysis, collection links)
    const result = await db
      .delete(assets)
      .where(inArray(assets.id, assetIds))
      .returning({ id: assets.id });

    if (result.length) {
      await db.insert(auditLog).values({
        action: 'bulk-delete',
        entityType: 'asset',
        entityId: null,
        details: { count: result.length, ids: result.map((r) => r.id) },
        ipAddress: request.ip,
      });
    }

    return { deleted: result.length };
  });

  // Bulk add tags (editor/admin)
  app.post('/bulk-tag', async (request) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { assetIds, tagNames } = request.body as {
      assetIds: string[];
      tagNames: string[];
    };
    if (!assetIds?.length || !tagNames?.length) return { added: 0 };

    // Upsert each tag and collect IDs
    const tagIds: string[] = [];
    for (const rawName of tagNames) {
      const name = rawName.toLowerCase().trim();
      if (!name) continue;
      const existing = await db.query.tags.findFirst({ where: eq(tags.name, name) });
      if (existing) {
        tagIds.push(existing.id);
      } else {
        const [created] = await db.insert(tags).values({ name }).returning();
        tagIds.push(created.id);
      }
    }

    // Link every (asset, tag) pair, skipping duplicates
    let added = 0;
    for (const assetId of assetIds) {
      for (const tagId of tagIds) {
        const result = await db
          .insert(assetTags)
          .values({ assetId, tagId })
          .onConflictDoNothing()
          .returning();
        if (result.length) added++;
      }
    }

    return { added };
  });

  // Trigger AI re-analysis (editor/admin)
  app.post<{ Params: { id: string } }>('/:id/analyze', async (request, reply) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { id } = request.params;

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!asset) {
      return reply.status(404).send({ error: 'Asset not found' });
    }

    if (!asset.thumbnailKey) {
      return reply.status(400).send({ error: 'Asset has no thumbnail yet' });
    }

    const queue = getQueue(QUEUE_NAMES.AI_ANALYSIS);
    await queue.add('analyze', {
      assetId: id,
      thumbnailKey: asset.thumbnailKey,
      inputKey: asset.storageKey,
    } satisfies AiAnalysisJobData);

    return { status: 'queued' };
  });
};
