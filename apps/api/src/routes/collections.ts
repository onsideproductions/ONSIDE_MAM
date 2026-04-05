import type { FastifyPluginAsync } from 'fastify';
import { eq, sql, isNull } from 'drizzle-orm';
import { getDb, collections, collectionAssets, assets, auditLog } from '../db/index.js';

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

    return result.map((r) => ({
      ...r.collection,
      assetCount: Number(r.assetCount),
    }));
  });

  // Get collection with children and assets
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const collection = await db.query.collections.findFirst({
      where: eq(collections.id, id),
    });

    if (!collection) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    // Get children
    const children = await db
      .select({
        collection: collections,
        assetCount: sql<number>`count(${collectionAssets.assetId})`,
      })
      .from(collections)
      .leftJoin(collectionAssets, eq(collectionAssets.collectionId, collections.id))
      .where(eq(collections.parentId, id))
      .groupBy(collections.id)
      .orderBy(collections.name);

    // Get assets in this collection
    const collectionAssetsResult = await db
      .select({ asset: assets })
      .from(collectionAssets)
      .innerJoin(assets, eq(collectionAssets.assetId, assets.id))
      .where(eq(collectionAssets.collectionId, id))
      .orderBy(collectionAssets.position);

    return {
      ...collection,
      children: children.map((c) => ({
        ...c.collection,
        assetCount: Number(c.assetCount),
      })),
      assets: collectionAssetsResult.map((r) => r.asset),
    };
  });

  // Create collection
  app.post('/', async (request) => {
    const db = getDb();
    const { name, description, parentId } = request.body as any;

    const [collection] = await db
      .insert(collections)
      .values({
        name,
        description,
        parentId,
        createdBy: 'system', // TODO: from auth session
      })
      .returning();

    await db.insert(auditLog).values({
      action: 'create',
      entityType: 'collection',
      entityId: collection.id,
      details: { name },
      ipAddress: request.ip,
    });

    return collection;
  });

  // Update collection
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const { name, description, parentId, coverAssetId } = request.body as any;

    const updated = await db
      .update(collections)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(parentId !== undefined && { parentId }),
        ...(coverAssetId !== undefined && { coverAssetId }),
      })
      .where(eq(collections.id, id))
      .returning();

    if (!updated.length) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    return updated[0];
  });

  // Delete collection
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const result = await db.delete(collections).where(eq(collections.id, id)).returning();

    if (!result.length) {
      return reply.status(404).send({ error: 'Collection not found' });
    }

    return { success: true };
  });

  // Add asset to collection
  app.post<{ Params: { id: string } }>('/:id/assets', async (request) => {
    const db = getDb();
    const { id } = request.params;
    const { assetId } = request.body as { assetId: string };

    // Get next position
    const lastPos = await db
      .select({ maxPos: sql<number>`coalesce(max(${collectionAssets.position}), -1)` })
      .from(collectionAssets)
      .where(eq(collectionAssets.collectionId, id));

    await db.insert(collectionAssets).values({
      collectionId: id,
      assetId,
      position: Number(lastPos[0]?.maxPos || 0) + 1,
    });

    return { success: true };
  });

  // Remove asset from collection
  app.delete<{ Params: { id: string; assetId: string } }>(
    '/:id/assets/:assetId',
    async (request) => {
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
};
