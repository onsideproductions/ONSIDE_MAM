import type { FastifyPluginAsync } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, auditLog, user as userTable } from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';

export const activityRoutes: FastifyPluginAsync = async (app) => {
  /** Activity timeline for a single asset (any logged-in user) */
  app.get<{ Params: { assetId: string }; Querystring: { limit?: string } }>(
    '/asset/:assetId',
    async (request) => {
      requireAuth(request);
      const db = getDb();
      const { assetId } = request.params;
      const limit = Math.min(Number(request.query.limit ?? 50), 200);

      const rows = await db
        .select({
          entry: auditLog,
          actor: { id: userTable.id, name: userTable.name, image: userTable.image },
        })
        .from(auditLog)
        .leftJoin(userTable, eq(userTable.id, auditLog.userId))
        .where(
          and(eq(auditLog.entityType, 'asset'), eq(auditLog.entityId, assetId))
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(limit);

      return rows.map((r) => ({
        id: r.entry.id,
        action: r.entry.action,
        details: r.entry.details,
        createdAt: r.entry.createdAt,
        actor: r.actor,
      }));
    }
  );

  /** Global activity feed (admin only) for the Audit Log viewer */
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/',
    async (request) => {
      requireRole(request, 'admin');
      const db = getDb();
      const limit = Math.min(Number(request.query.limit ?? 100), 500);
      const offset = Number(request.query.offset ?? 0);

      const rows = await db
        .select({
          entry: auditLog,
          actor: { id: userTable.id, name: userTable.name, email: userTable.email },
        })
        .from(auditLog)
        .leftJoin(userTable, eq(userTable.id, auditLog.userId))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      return rows.map((r) => ({
        id: r.entry.id,
        action: r.entry.action,
        entityType: r.entry.entityType,
        entityId: r.entry.entityId,
        details: r.entry.details,
        ipAddress: r.entry.ipAddress,
        createdAt: r.entry.createdAt,
        actor: r.actor,
      }));
    }
  );
};
