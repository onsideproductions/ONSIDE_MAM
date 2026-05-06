import type { FastifyPluginAsync } from 'fastify';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { getDb, shares, assets, user } from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';
import { hashSharePassword, verifySharePassword } from '../lib/share-password.js';
import { getStreamUrl, getDownloadUrl } from '../lib/storage.js';

interface CreateShareBody {
  assetId: string;
  title?: string;
  password?: string;
  expiresAt?: string; // ISO
  allowDownload?: boolean;
}

/** Private share-management routes (require auth) */
export const shareRoutes: FastifyPluginAsync = async (app) => {
  // List shares (your own, or all if admin)
  app.get('/', async (request) => {
    const me = requireAuth(request);
    const db = getDb();
    const isAdmin = me.role === 'admin';

    const rows = await db
      .select({
        share: shares,
        asset: {
          id: assets.id,
          title: assets.title,
          thumbnailKey: assets.thumbnailKey,
        },
        creatorName: user.name,
      })
      .from(shares)
      .leftJoin(assets, eq(assets.id, shares.assetId))
      .leftJoin(user, eq(user.id, shares.createdBy))
      .where(isAdmin ? undefined : eq(shares.createdBy, me.id))
      .orderBy(desc(shares.createdAt));

    return Promise.all(
      rows.map(async (r) => {
        let thumbnailUrl: string | null = null;
        if (r.asset?.thumbnailKey) {
          thumbnailUrl = await getStreamUrl(r.asset.thumbnailKey);
        }
        return {
          ...r.share,
          // Don't leak the password hash
          passwordHash: undefined,
          hasPassword: !!r.share.passwordHash,
          asset: r.asset ? { id: r.asset.id, title: r.asset.title, thumbnailUrl } : null,
          creatorName: r.creatorName,
        };
      })
    );
  });

  // Create a share (editor/admin)
  app.post('/', async (request, reply) => {
    const me = requireRole(request, 'admin', 'editor');
    const db = getDb();
    const body = request.body as CreateShareBody;

    if (!body.assetId) {
      return reply.status(400).send({ error: 'assetId is required' });
    }
    const asset = await db.query.assets.findFirst({ where: eq(assets.id, body.assetId) });
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });

    const passwordHash = body.password ? await hashSharePassword(body.password) : null;

    const [created] = await db
      .insert(shares)
      .values({
        assetId: body.assetId,
        title: body.title?.trim() || null,
        passwordHash,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        allowDownload: !!body.allowDownload,
        createdBy: me.id,
      })
      .returning();

    return {
      ...created,
      passwordHash: undefined,
      hasPassword: !!created.passwordHash,
    };
  });

  // Update a share's settings (creator or admin)
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const { id } = request.params;
    const body = request.body as Partial<CreateShareBody> & { revoke?: boolean };

    const existing = await db.query.shares.findFirst({ where: eq(shares.id, id) });
    if (!existing) return reply.status(404).send({ error: 'Share not found' });
    if (me.role !== 'admin' && existing.createdBy !== me.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title?.trim() || null;
    if (body.expiresAt !== undefined) {
      update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }
    if (body.allowDownload !== undefined) update.allowDownload = !!body.allowDownload;
    if (body.password !== undefined) {
      update.passwordHash = body.password
        ? await hashSharePassword(body.password)
        : null;
    }
    if (body.revoke) update.revokedAt = new Date();

    const [updated] = await db
      .update(shares)
      .set(update)
      .where(eq(shares.id, id))
      .returning();

    return {
      ...updated,
      passwordHash: undefined,
      hasPassword: !!updated.passwordHash,
    };
  });

  // Delete a share (creator or admin)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const { id } = request.params;

    const existing = await db.query.shares.findFirst({ where: eq(shares.id, id) });
    if (!existing) return reply.status(404).send({ error: 'Share not found' });
    if (me.role !== 'admin' && existing.createdBy !== me.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await db.delete(shares).where(eq(shares.id, id));
    return { success: true };
  });
};

/** Public share-viewing routes (no auth required) */
export const publicShareRoutes: FastifyPluginAsync = async (app) => {
  /** Returns share metadata. If a password is required, returns
   *  { needsPassword: true } until POST /:id/access succeeds. */
  app.get<{ Params: { id: string } }>('/shares/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const share = await db.query.shares.findFirst({ where: eq(shares.id, id) });

    if (!share || share.revokedAt) {
      return reply.status(404).send({ error: 'Share not found or revoked' });
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.status(410).send({ error: 'Share has expired' });
    }

    if (share.passwordHash) {
      return {
        id: share.id,
        title: share.title,
        needsPassword: true,
      };
    }

    return buildSharePayload(db, share);
  });

  /** Submit password to access a password-protected share */
  app.post<{ Params: { id: string } }>('/shares/:id/access', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const { password } = (request.body as { password?: string }) ?? {};

    const share = await db.query.shares.findFirst({ where: eq(shares.id, id) });
    if (!share || share.revokedAt) {
      return reply.status(404).send({ error: 'Share not found or revoked' });
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.status(410).send({ error: 'Share has expired' });
    }
    if (share.passwordHash) {
      if (!password) {
        return reply.status(401).send({ error: 'Password required' });
      }
      const ok = await verifySharePassword(password, share.passwordHash);
      if (!ok) {
        return reply.status(401).send({ error: 'Wrong password' });
      }
    }

    return buildSharePayload(db, share);
  });

  /** Generate a download URL if downloads are allowed */
  app.post<{ Params: { id: string } }>(
    '/shares/:id/download',
    async (request, reply) => {
      const db = getDb();
      const { id } = request.params;
      const { password } = (request.body as { password?: string }) ?? {};

      const share = await db.query.shares.findFirst({ where: eq(shares.id, id) });
      if (!share || share.revokedAt) {
        return reply.status(404).send({ error: 'Share not found or revoked' });
      }
      if (share.expiresAt && share.expiresAt < new Date()) {
        return reply.status(410).send({ error: 'Share has expired' });
      }
      if (!share.allowDownload) {
        return reply.status(403).send({ error: 'Downloads are not allowed for this share' });
      }
      if (share.passwordHash) {
        if (!password) {
          return reply.status(401).send({ error: 'Password required' });
        }
        const ok = await verifySharePassword(password, share.passwordHash);
        if (!ok) {
          return reply.status(401).send({ error: 'Wrong password' });
        }
      }

      const asset = await db.query.assets.findFirst({ where: eq(assets.id, share.assetId) });
      if (!asset) return reply.status(404).send({ error: 'Asset no longer exists' });

      const url = await getDownloadUrl(asset.storageKey, 3600, asset.originalFilename);
      return { url, filename: asset.originalFilename };
    }
  );
};

async function buildSharePayload(
  db: ReturnType<typeof getDb>,
  share: typeof shares.$inferSelect
) {
  const asset = await db.query.assets.findFirst({
    where: eq(assets.id, share.assetId),
  });
  if (!asset) {
    return { id: share.id, error: 'Asset no longer exists' };
  }

  // Bump view count async (don't await, don't fail the request on errors)
  db
    .update(shares)
    .set({
      viewCount: sql`${shares.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(shares.id, share.id))
    .catch(() => {
      /* ignore */
    });

  let streamUrl: string | null = null;
  let streamType: 'mp4' | 'hls' | null = null;
  if (asset.proxyKey) {
    streamUrl = await getStreamUrl(asset.proxyKey);
    streamType = 'mp4';
  } else if (asset.hlsKey) {
    streamUrl = `/api/public/shares/${share.id}/stream.m3u8`;
    streamType = 'hls';
  }

  let thumbnailUrl: string | null = null;
  if (asset.thumbnailKey) {
    thumbnailUrl = await getStreamUrl(asset.thumbnailKey);
  }

  return {
    id: share.id,
    title: share.title,
    allowDownload: share.allowDownload,
    asset: {
      id: asset.id,
      title: asset.title,
      duration: asset.duration,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    },
    streamUrl,
    streamType,
    thumbnailUrl,
  };
}
