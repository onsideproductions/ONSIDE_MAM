import type { FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import multipart from '@fastify/multipart';
import {
  getDb,
  user,
  assets,
  collections,
  notificationPreferences,
  accountSettings,
} from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';
import {
  getStreamUrl,
  uploadToStorage,
  deleteFromStorage,
} from '../lib/storage.js';
import { nanoid } from 'nanoid';

const SETTINGS_ID = 'default';

interface Branding {
  teamName?: string;
  accentColor?: string;
  logoKey?: string;
}

async function getBranding(db: ReturnType<typeof getDb>): Promise<Branding> {
  const row = await db.query.accountSettings.findFirst({
    where: eq(accountSettings.id, SETTINGS_ID),
  });
  return (row?.branding as Branding) ?? {};
}

async function settingsWithUrls(
  db: ReturnType<typeof getDb>,
  row: typeof accountSettings.$inferSelect
) {
  const branding = (row.branding as Branding) ?? {};
  let logoUrl: string | null = null;
  if (branding.logoKey) {
    logoUrl = await getStreamUrl(branding.logoKey);
  }
  return {
    ...row,
    branding: { ...branding, logoUrl },
  };
}

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
    return settingsWithUrls(db, row);
  });

  app.patch('/account', async (request) => {
    requireRole(request, 'admin');
    const db = getDb();
    const body = request.body as { branding?: Branding; sharesDefaults?: unknown };

    // Strip transient fields a client might send back (logoUrl is derived)
    if (body.branding && 'logoUrl' in body.branding) {
      delete (body.branding as Branding & { logoUrl?: string }).logoUrl;
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.branding !== undefined) update.branding = body.branding;
    if (body.sharesDefaults !== undefined) update.sharesDefaults = body.sharesDefaults;

    const existing = await db.query.accountSettings.findFirst({
      where: eq(accountSettings.id, SETTINGS_ID),
    });
    let row;
    if (existing) {
      const [updated] = await db
        .update(accountSettings)
        .set(update)
        .where(eq(accountSettings.id, SETTINGS_ID))
        .returning();
      row = updated;
    } else {
      const [created] = await db
        .insert(accountSettings)
        .values({ id: SETTINGS_ID, ...update })
        .returning();
      row = created;
    }
    return settingsWithUrls(db, row);
  });

  // ----- Logo upload (admin) -----

  // Register multipart parser scoped to this plugin
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  });

  app.post('/account/logo', async (request, reply) => {
    requireRole(request, 'admin');
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!file.mimetype.startsWith('image/')) {
      return reply.status(400).send({ error: 'File must be an image' });
    }

    const db = getDb();
    const branding = await getBranding(db);

    // Generate a new key (so signed URLs cache-bust properly)
    const ext = file.filename?.split('.').pop()?.toLowerCase() || 'png';
    const newKey = `branding/logo-${nanoid(8)}.${ext}`;

    // Upload to Wasabi
    const buffer = await file.toBuffer();
    await uploadToStorage(newKey, buffer, file.mimetype);

    // Delete the old logo if it existed (best-effort)
    if (branding.logoKey) {
      deleteFromStorage(branding.logoKey).catch(() => {
        /* ignore */
      });
    }

    // Persist
    const next: Branding = { ...branding, logoKey: newKey };
    const existing = await db.query.accountSettings.findFirst({
      where: eq(accountSettings.id, SETTINGS_ID),
    });
    let row;
    if (existing) {
      const [updated] = await db
        .update(accountSettings)
        .set({ branding: next, updatedAt: new Date() })
        .where(eq(accountSettings.id, SETTINGS_ID))
        .returning();
      row = updated;
    } else {
      const [created] = await db
        .insert(accountSettings)
        .values({ id: SETTINGS_ID, branding: next })
        .returning();
      row = created;
    }
    return settingsWithUrls(db, row);
  });

  app.delete('/account/logo', async (request) => {
    requireRole(request, 'admin');
    const db = getDb();
    const branding = await getBranding(db);

    if (branding.logoKey) {
      deleteFromStorage(branding.logoKey).catch(() => {
        /* ignore */
      });
    }

    const next: Branding = { ...branding };
    delete next.logoKey;

    const [updated] = await db
      .update(accountSettings)
      .set({ branding: next, updatedAt: new Date() })
      .where(eq(accountSettings.id, SETTINGS_ID))
      .returning();
    return settingsWithUrls(db, updated);
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
