import type { FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  getDb,
  user,
  assets,
  collections,
  notificationPreferences,
  accountSettings,
} from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';

const SETTINGS_ID = 'default';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // ----- Notification preferences (current user) -----

  app.get('/notifications', async (request) => {
    const me = requireAuth(request);
    const db = getDb();

    const found = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, me.id),
    });
    if (found) return found;

    // Create default row on first read
    const [created] = await db
      .insert(notificationPreferences)
      .values({ userId: me.id })
      .returning();
    return created;
  });

  app.patch('/notifications', async (request) => {
    const me = requireAuth(request);
    const db = getDb();
    const body = request.body as Partial<typeof notificationPreferences.$inferInsert>;

    // Whitelist updatable fields to avoid clients setting userId/updatedAt
    const allowed = [
      'commentsGeneral',
      'commentsReplies',
      'commentsMentions',
      'uploadsYours',
      'uploadsOthers',
      'statusUpdates',
      'assignedToYou',
      'transcriptionActivity',
      'emailEnabled',
    ] as const;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      if (k in body) update[k] = (body as Record<string, unknown>)[k];
    }

    // Upsert: if no row exists yet, create it with the patch values
    const existing = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, me.id),
    });

    if (existing) {
      const [updated] = await db
        .update(notificationPreferences)
        .set(update)
        .where(eq(notificationPreferences.userId, me.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(notificationPreferences)
        .values({ userId: me.id, ...update })
        .returning();
      return created;
    }
  });

  // ----- Account settings (branding + share defaults). Admin-only. -----

  app.get('/account', async (request) => {
    requireAuth(request);
    const db = getDb();

    let row = await db.query.accountSettings.findFirst({
      where: eq(accountSettings.id, SETTINGS_ID),
    });
    if (!row) {
      const [created] = await db
        .insert(accountSettings)
        .values({ id: SETTINGS_ID })
        .returning();
      row = created;
    }
    return row;
  });

  app.patch('/account', async (request) => {
    requireRole(request, 'admin');
    const db = getDb();
    const body = request.body as { branding?: unknown; sharesDefaults?: unknown };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.branding !== undefined) update.branding = body.branding;
    if (body.sharesDefaults !== undefined) update.sharesDefaults = body.sharesDefaults;

    // Upsert
    const existing = await db.query.accountSettings.findFirst({
      where: eq(accountSettings.id, SETTINGS_ID),
    });
    if (existing) {
      const [updated] = await db
        .update(accountSettings)
        .set(update)
        .where(eq(accountSettings.id, SETTINGS_ID))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(accountSettings)
        .values({ id: SETTINGS_ID, ...update })
        .returning();
      return created;
    }
  });

  // ----- Usage stats. Any logged-in user can read their team's totals. -----

  app.get('/usage', async (request) => {
    requireAuth(request);
    const db = getDb();

    const [
      memberCount,
      collectionCount,
      assetCount,
      storageRows,
      adminCount,
      editorCount,
      viewerCount,
    ] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(user),
      db.select({ n: sql<number>`count(*)::int` }).from(collections),
      db.select({ n: sql<number>`count(*)::int` }).from(assets),
      db
        .select({ total: sql<number>`coalesce(sum(${assets.fileSize}), 0)::bigint` })
        .from(assets),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, 'admin')),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, 'editor')),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, 'viewer')),
    ]);

    return {
      members: {
        total: Number(memberCount[0]?.n ?? 0),
        admins: Number(adminCount[0]?.n ?? 0),
        editors: Number(editorCount[0]?.n ?? 0),
        viewers: Number(viewerCount[0]?.n ?? 0),
      },
      collections: Number(collectionCount[0]?.n ?? 0),
      assets: Number(assetCount[0]?.n ?? 0),
      storageBytes: Number(storageRows[0]?.total ?? 0),
    };
  });
};
