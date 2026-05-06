import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, users } from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';

export const userRoutes: FastifyPluginAsync = async (app) => {
  // Current user
  app.get('/me', async (request) => {
    return request.user;
  });

  // List users (admin only)
  app.get('/', async (request) => {
    requireRole(request, 'admin');
    const db = getDb();
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        image: users.image,
        createdAt: users.createdAt,
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
        image: users.image,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id));

    if (!user.length) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return user[0];
  });

  // Update user. Users can update their own name/image.
  // Only admins can change role or update someone else.
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const { id } = request.params;
    const { name, role, image } = request.body as any;

    if (id !== me.id && me.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    if (role !== undefined && me.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can change roles' });
    }

    const updated = await db
      .update(users)
      .set({
        ...(name && { name }),
        ...(role && { role }),
        ...(image !== undefined && { image }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        image: users.image,
      });

    if (!updated.length) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return updated[0];
  });
};
