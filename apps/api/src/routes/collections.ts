import type { FastifyPluginAsync } from 'fastify';
import { eq, sql, isNull, inArray } from 'drizzle-orm';
import { getDb, collections, collectionAssets, assets, auditLog } from '../db/index.js';
import { getStreamUrl } from '../lib/storage.js';
import { requireRole } from '../plugins/session.js';

/**
 * Returns a Map<collectionId, number> with the recursive asset count
 * (this folder + all descendants). DISTINCT so an asset in two
 * descendants of the same root only counts once.
 */
async function recursiveAssetCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ids: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!ids.length) return result;

  const rows = await db.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT id AS root_id, id AS descendant_id
      FROM collections
      WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      UNION ALL
      SELECT d.root_id, c.id
      FROM collections c
      INNER JOIN descendants d ON c.parent_id = d.descendant_id
    )
    SELECT d.root_id, COUNT(DISTINCT ca.asset_id)::int AS asset_count
    FROM descendants d
    LEFT JOIN collection_assets ca ON ca.collection_id = d.descendant_id
    GROUP BY d.root_id
  `);
  // drizzle returns { rows: [...] } for raw execute on pg
  const raw = rows as unknown as
    | { rows?: Array<{ root_id: string; asset_count: number }> }
    | Array<{ root_id: string; asset_count: number }>;
  const list: Array<{ root_id: string; asset_count: number }> = Array.isArray(raw)
    ? raw
    : raw.rows ?? [];
  for (const row of list) {
    result.set(row.root_id, Number(row.asset_count));
  }
  return result;
}

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  // List root collections (no parent)
  app.get('/', async () => {
    const db = getDb();

    const rows = await db
      .select()
      .from(collections)
      .where(isNull(collections.parentId))
      .orderBy(collections.name);

    const counts = await recursiveAssetCounts(
      db,
      rows.map((c) => c.id)
    );

    return Promise.all(
      rows.map(async (c) => {
        let coverUrl: string | null = null;
        if (c.coverAssetId) {
          const cover = await db.query.assets.findFirst({
            where: eq(assets.id, c.coverAssetId),
          });
          if (cover?.thumbnailKey) {
            coverUrl = await getStreamUrl(cover.thumbnailKey);
          }
        }
        return {
          ...c,
          assetCount: counts.get(c.id) ?? 0,
          coverUrl,
        };
      })
    );
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
    const childRows = await db
      .select()
      .from(collections)
      .where(eq(collections.parentId, id))
      .orderBy(collections.name);

    const childCounts = await recursiveAssetCounts(
      db,
      childRows.map((c) => c.id)
    );

    const children = await Promise.all(
      childRows.map(async (c) => {
        let coverUrl: string | null = null;
        if (c.coverAssetId) {
          const cover = await db.query.assets.findFirst({
            where: eq(assets.id, c.coverAssetId),
          });
          if (cover?.thumbnailKey) {
            coverUrl = await getStreamUrl(cover.thumbnailKey);
          }
        }
        return {
          ...c,
          assetCount: childCounts.get(c.id) ?? 0,
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
