import type { FastifyPluginAsync } from 'fastify';
import { eq, sql, isNull, inArray } from 'drizzle-orm';
import { getDb, collections, collectionAssets, assets, auditLog } from '../db/index.js';
import { getStreamUrl } from '../lib/storage.js';
import { requireRole } from '../plugins/session.js';

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  // List root collections (no parent)
  app.get('/', async () => {
    const db = getDb();

    const result = await db
      .select({
        collection: collections,
        assetCount: sql<number>`count(${collectionAssets.assetId})`,
      })
      .from(collections)
      .leftJoin(collectionAssets, eq(collectionAssets.collectionId, collections.id))
      .where(isNull(collections.parentId))
      .groupBy(collections.id)
      .orderBy(collections.name);

    // Generate signed URLs for cover images
    const withCovers = await Promise.all(
      result.map(async (r) => {
        let coverUrl: string | null = null;
        if (r.collection.coverAssetId) {
          const cover = await db.query.assets.findFirst({
            where: eq(assets.id, r.collection.coverAssetId),
          });
          if (cover?.thumbnailKey) {
            coverUrl = await getStreamUrl(cover.thumbnailKey);
          }
        }
        return {
          ...r.collection,
          assetCount: Number(r.assetCount),
          coverUrl,
        };
      })
    );

    return withCovers;
  });

  // Flat list of all collections (for picker UI)
  app.get('/all', async () => {
    const db = getDb();
    const result = await db
      .select({
        id: collections.id,
        name: collections.name,
        parentId: collections.parentId,
      })
      .from(collections)
      .orderBy(collections.name);
    return result;
  });

  // Get collection with children, assets, and breadcrumb
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const collection = await db.query.collections.findFirst({
      where: eq(collections.id, id),
    });

    if (!collection) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    // Walk up the parent chain to build breadcrumb
    const breadcrumb: { id: string; name: string }[] = [];
    let cursor: { id: string; name: string; parentId: string | null } | null = {
      id: collection.id,
      name: collection.name,
      parentId: collection.parentId,
    };
    while (cursor) {
      breadcrumb.unshift({ id: cursor.id, name: cursor.name });
      if (!cursor.parentId) break;
      const parentId: string = cursor.parentId;
      const parent = await db.query.collections.findFirst({
        where: eq(collections.id, parentId),
        columns: { id: true, name: true, parentId: true },
      });
      cursor = parent ? { id: parent.id, name: parent.name, parentId: parent.parentId } : null;
    }

    // Get children
    const childrenRows = await db
      .select({
        collection: collections,
        assetCount: sql<number>`count(${collectionAssets.assetId})`,
      })
      .from(collections)
      .leftJoin(collectionAssets, eq(collectionAssets.collectionId, collections.id))
      .where(eq(collections.parentId, id))
      .groupBy(collections.id)
      .orderBy(collections.name);

    const children = await Promise.all(
      childrenRows.map(async (c) => {
        let coverUrl: string | null = null;
        if (c.collection.coverAssetId) {
          const cover = await db.query.assets.findFirst({
            where: eq(assets.id, c.collection.coverAssetId),
          });
          if (cover?.thumbnailKey) {
            coverUrl = await getStreamUrl(cover.thumbnailKey);
          }
        }
        return {
          ...c.collection,
          assetCount: Number(c.assetCount),
          coverUrl,
        };
      })
    );

    // Get assets in this collection with thumbnail URLs
    const collectionAssetsResult = await db
      .select({ asset: assets })
      .from(collectionAssets)
      .innerJoin(assets, eq(collectionAssets.assetId, assets.id))
      .where(eq(collectionAssets.collectionId, id))
      .orderBy(collectionAssets.position);

    const assetsWithUrls = await Promise.all(
      collectionAssetsResult.map(async (r) => {
        let thumbnailUrl: string | null = null;
        if (r.asset.thumbnailKey) {
          thumbnailUrl = await getStreamUrl(r.asset.thumbnailKey);
        }
        return { ...r.asset, thumbnailUrl };
      })
    );

    return {
      ...collection,
      breadcrumb,
      children,
      assets: assetsWithUrls,
    };
  });

  // Create collection (editor/admin)
  app.post('/', async (request) => {
    const user = requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { name, description, parentId } = request.body as any;

    if (!name?.trim()) {
      const err = new Error('Name is required');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    const [collection] = await db
      .insert(collections)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        parentId: parentId || null,
        createdBy: user.id,
      })
      .returning();

    await db.insert(auditLog).values({
      action: 'create',
      entityType: 'collection',
      entityId: collection.id,
      details: { name: collection.name },
      ipAddress: request.ip,
    });

    return collection;
  });

  // Update collection (editor/admin)
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { id } = request.params;
    const { name, description, parentId, coverAssetId } = request.body as any;

    // Don't let a collection be its own ancestor
    if (parentId && parentId === id) {
      return reply.status(400).send({ error: 'Cannot move a collection into itself' });
    }

    const updated = await db
      .update(collections)
      .set({
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(coverAssetId !== undefined && { coverAssetId: coverAssetId || null }),
      })
      .where(eq(collections.id, id))
      .returning();

    if (!updated.length) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    return updated[0];
  });

  // Delete collection (admin only)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireRole(request, 'admin');
    const db = getDb();
    const { id } = request.params;

    // Check for child collections - reparent them to root rather than failing
    await db
      .update(collections)
      .set({ parentId: null })
      .where(eq(collections.parentId, id));

    const result = await db.delete(collections).where(eq(collections.id, id)).returning();

    if (!result.length) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    await db.insert(auditLog).values({
      action: 'delete',
      entityType: 'collection',
      entityId: id,
      details: { name: result[0].name },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // Add one or more assets to collection (editor/admin)
  app.post<{ Params: { id: string } }>('/:id/assets', async (request) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { id } = request.params;
    const body = request.body as { assetId?: string; assetIds?: string[] };
    const ids = body.assetIds || (body.assetId ? [body.assetId] : []);

    if (!ids.length) return { added: 0 };

    // Get next position once
    const lastPos = await db
      .select({ maxPos: sql<number>`coalesce(max(${collectionAssets.position}), -1)` })
      .from(collectionAssets)
      .where(eq(collectionAssets.collectionId, id));

    let position = Number(lastPos[0]?.maxPos ?? -1) + 1;

    let added = 0;
    for (const assetId of ids) {
      const result = await db
        .insert(collectionAssets)
        .values({ collectionId: id, assetId, position })
        .onConflictDoNothing()
        .returning();
      if (result.length) added++;
      position++;
    }

    return { added };
  });

  // Remove one or more assets from collection (editor/admin)
  app.delete<{ Params: { id: string; assetId: string } }>(
    '/:id/assets/:assetId',
    async (request) => {
      requireRole(request, 'admin', 'editor');
      const db = getDb();
      const { id, assetId } = request.params;

      await db
        .delete(collectionAssets)
        .where(
          sql`${collectionAssets.collectionId} = ${id} AND ${collectionAssets.assetId} = ${assetId}`
        );

      return { success: true };
    }
  );

  // Bulk remove
  app.post<{ Params: { id: string } }>('/:id/assets/remove', async (request) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { id } = request.params;
    const { assetIds } = request.body as { assetIds: string[] };
    if (!assetIds?.length) return { removed: 0 };

    const result = await db
      .delete(collectionAssets)
      .where(
        sql`${collectionAssets.collectionId} = ${id} AND ${collectionAssets.assetId} IN (${sql.join(
          assetIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
      .returning();

    return { removed: result.length };
  });
};
