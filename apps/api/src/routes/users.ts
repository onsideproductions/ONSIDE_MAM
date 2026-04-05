import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, users } from '../db/index.js';

export const userRoutes: FastifyPluginAsync = async (app) => {
  // List users (admin only)
  app.get('/', async () => {
    const db = getDb();
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(users.name);

    return result;
  });

  // Get user by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, id));

    if (!user.length) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return user[0];
  });

  // Update user role (admin only)
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;
    const { name, role, avatarUrl } = request.body as any;

    const updated = await db
      .update(users)
      .set({
        ...(name && { name }),
        ...(role && { role }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
      });

    if (!updated.length) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return updated[0];
  });
};
