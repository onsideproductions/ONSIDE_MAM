import type { FastifyPluginAsync } from 'fastify';
import { eq, and, asc, ilike, or, inArray } from 'drizzle-orm';
import {
  getDb,
  comments,
  commentMentions,
  user as userTable,
  assets,
  auditLog,
} from '../db/index.js';
import { requireAuth } from '../plugins/session.js';

interface CreateCommentBody {
  assetId: string;
  body: string;
  timecode?: number | null;
  parentId?: string | null;
  mentionedUserIds?: string[]; // optional explicit list
}

/**
 * Resolve user IDs for @mentions found in a comment body.
 * Matches on case-insensitive name OR email. Returns at most `maxResults` IDs.
 */
async function resolveMentions(
  db: ReturnType<typeof getDb>,
  body: string
): Promise<string[]> {
  // Simple regex: @ followed by name chars including spaces up to a punctuation boundary.
  // We'll just look at name tokens (no spaces) - frame.io style is "@firstname".
  const matches = Array.from(body.matchAll(/@([a-zA-Z][\w.\-]{1,40})/g)).map((m) => m[1]);
  if (!matches.length) return [];

  // For each token, try to match it against the start of any user's name or email
  const lowercased = matches.map((m) => m.toLowerCase());
  const conditions = lowercased.map((name) =>
    or(ilike(userTable.name, `${name}%`), ilike(userTable.email, `${name}%`))
  );

  const found = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .where(or(...conditions));

  // Dedupe by id
  return Array.from(new Set(found.map((u) => u.id)));
}

export const commentRoutes: FastifyPluginAsync = async (app) => {
  // List comments for an asset
  app.get<{ Querystring: { assetId?: string } }>('/', async (request, reply) => {
    requireAuth(request);
    const { assetId } = request.query;
    if (!assetId) {
      return reply.status(400).send({ error: 'assetId is required' });
    }
    const db = getDb();

    const rows = await db
      .select({
        comment: comments,
        author: {
          id: userTable.id,
          name: userTable.name,
          image: userTable.image,
        },
      })
      .from(comments)
      .leftJoin(userTable, eq(userTable.id, comments.authorId))
      .where(eq(comments.assetId, assetId))
      .orderBy(asc(comments.createdAt));

    if (!rows.length) return [];

    // Pull mentions for these comments in one go
    const ids = rows.map((r) => r.comment.id);
    const mentionRows = await db
      .select({
        commentId: commentMentions.commentId,
        userId: commentMentions.userId,
        userName: userTable.name,
      })
      .from(commentMentions)
      .leftJoin(userTable, eq(userTable.id, commentMentions.userId))
      .where(inArray(commentMentions.commentId, ids));

    const mentionsByComment = new Map<
      string,
      Array<{ id: string; name: string | null }>
    >();
    for (const m of mentionRows) {
      const list = mentionsByComment.get(m.commentId) ?? [];
      list.push({ id: m.userId, name: m.userName });
      mentionsByComment.set(m.commentId, list);
    }

    return rows.map((r) => ({
      ...r.comment,
      author: r.author,
      mentions: mentionsByComment.get(r.comment.id) ?? [],
    }));
  });

  // Create comment
  app.post('/', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const body = request.body as CreateCommentBody;

    if (!body.assetId || !body.body?.trim()) {
      return reply.status(400).send({ error: 'assetId and body are required' });
    }

    // Verify asset exists
    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, body.assetId),
    });
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });

    // Verify parent comment if specified
    if (body.parentId) {
      const parent = await db.query.comments.findFirst({
        where: and(
          eq(comments.id, body.parentId),
          eq(comments.assetId, body.assetId)
        ),
      });
      if (!parent) return reply.status(400).send({ error: 'parent comment not found' });
    }

    // Resolve mentions: combine explicit list with parsed from body
    const parsed = await resolveMentions(db, body.body);
    const explicit = body.mentionedUserIds ?? [];
    const mentioned = Array.from(new Set([...parsed, ...explicit])).filter(
      (id) => id !== me.id // don't mention self
    );

    const [created] = await db
      .insert(comments)
      .values({
        assetId: body.assetId,
        parentId: body.parentId ?? null,
        authorId: me.id,
        body: body.body.trim(),
        timecode:
          body.timecode === undefined || body.timecode === null
            ? null
            : Number(body.timecode),
      })
      .returning();

    if (mentioned.length) {
      await db.insert(commentMentions).values(
        mentioned.map((userId) => ({ commentId: created.id, userId }))
      );
    }

    // Audit
    await db.insert(auditLog).values({
      action: 'comment',
      entityType: 'asset',
      entityId: body.assetId,
      userId: me.id,
      details: {
        commentId: created.id,
        timecode: created.timecode,
        mentionCount: mentioned.length,
      },
      ipAddress: request.ip,
    });

    return {
      ...created,
      author: { id: me.id, name: me.name, image: me.image },
      mentions: [],
    };
  });

  // Edit comment (author only)
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const { id } = request.params;
    const body = request.body as { body?: string };

    const existing = await db.query.comments.findFirst({ where: eq(comments.id, id) });
    if (!existing) return reply.status(404).send({ error: 'Comment not found' });
    if (existing.authorId !== me.id) {
      return reply.status(403).send({ error: 'Only the author can edit a comment' });
    }
    if (!body.body?.trim()) {
      return reply.status(400).send({ error: 'body is required' });
    }

    const newBody = body.body.trim();

    // Re-resolve mentions and replace
    const newMentions = await resolveMentions(db, newBody);
    await db.delete(commentMentions).where(eq(commentMentions.commentId, id));
    if (newMentions.length) {
      await db.insert(commentMentions).values(
        newMentions
          .filter((u) => u !== me.id)
          .map((userId) => ({ commentId: id, userId }))
      );
    }

    const [updated] = await db
      .update(comments)
      .set({ body: newBody, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    return updated;
  });

  // Toggle resolved
  app.post<{ Params: { id: string } }>('/:id/resolve', async (request, reply) => {
    requireAuth(request);
    const db = getDb();
    const { id } = request.params;

    const existing = await db.query.comments.findFirst({ where: eq(comments.id, id) });
    if (!existing) return reply.status(404).send({ error: 'Comment not found' });

    const [updated] = await db
      .update(comments)
      .set({ resolved: !existing.resolved, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    return updated;
  });

  // Delete comment (author or admin)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const { id } = request.params;

    const existing = await db.query.comments.findFirst({ where: eq(comments.id, id) });
    if (!existing) return reply.status(404).send({ error: 'Comment not found' });
    if (existing.authorId !== me.id && me.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await db.delete(comments).where(eq(comments.id, id));
    return { success: true };
  });
};
