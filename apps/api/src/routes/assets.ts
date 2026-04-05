import type { FastifyPluginAsync } from 'fastify';
import { eq, desc, sql, ilike, and, inArray } from 'drizzle-orm';
import { getDb, assets, tags, assetTags, aiAnalysis, auditLog } from '../db/index.js';
import { getDownloadUrl, getStreamUrl, deleteFromStorage, storageKey } from '../lib/storage.js';
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

    return {
      data,
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

    // Generate streaming URL if asset is ready
    let streamUrl = null;
    let thumbnailUrl = null;
    if (asset.status === 'ready') {
      if (asset.hlsKey) {
        streamUrl = await getStreamUrl(asset.hlsKey);
      } else if (asset.proxyKey) {
        streamUrl = await getStreamUrl(asset.proxyKey);
      }
      if (asset.thumbnailKey) {
        thumbnailUrl = await getStreamUrl(asset.thumbnailKey);
      }
    }

    return {
      ...asset,
      tags: assetTagRows.map((r) => r.tag),
      aiAnalysis: analysis || null,
      streamUrl,
      thumbnailUrl,
    };
  });

  // Update asset metadata
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
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

  // Delete asset
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
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

  // Add tags to asset
  app.post<{ Params: { id: string } }>('/:id/tags', async (request) => {
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

  // Remove tag from asset
  app.delete<{ Params: { id: string; tagId: string } }>(
    '/:id/tags/:tagId',
    async (request) => {
      const db = getDb();
      const { id, tagId } = request.params;

      await db
        .delete(assetTags)
        .where(and(eq(assetTags.assetId, id), eq(assetTags.tagId, tagId)));

      return { success: true };
    }
  );

  // Get download URL for asset
  app.get<{ Params: { id: string } }>('/:id/download', async (request, reply) => {
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

  // Trigger AI re-analysis
  app.post<{ Params: { id: string } }>('/:id/analyze', async (request, reply) => {
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
