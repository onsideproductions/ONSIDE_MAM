import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, users } from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';
import { getAuth } from '../lib/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

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

  // Create user (admin only). Uses better-auth's signUpEmail under the hood
  // so the password is hashed correctly and the account row is created.
  app.post('/', async (request, reply) => {
    requireRole(request, 'admin');
    const { email, password, name, role } = request.body as {
      email: string;
      password: string;
      name: string;
      role?: 'admin' | 'editor' | 'viewer';
    };

    if (!email || !password || !name) {
      return reply.status(400).send({ error: 'email, password and name are required' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

    const auth = getAuth();
    try {
      // Use better-auth's API. We pass our own headers so it doesn't try
      // to log the new user in as the requester.
      const result = await auth.api.signUpEmail({
        body: { email, password, name },
        headers: fromNodeHeaders(request.headers),
      });

      const newUserId = result?.user?.id;
      if (!newUserId) {
        return reply.status(500).send({ error: 'Failed to create user' });
      }

      // Set the requested role (signUpEmail ignores role since input:false)
      const targetRole = role ?? 'viewer';
      await getDb()
        .update(users)
        .set({ role: targetRole, updatedAt: new Date() })
        .where(eq(users.id, newUserId));

      return {
        id: newUserId,
        email,
        name,
        role: targetRole,
      };
    } catch (err) {
      const message =
        (err as { message?: string }).message ?? 'Failed to create user';
      app.log.error({ err }, 'admin create user failed');
      return reply.status(400).send({ error: message });
    }
  });

  // Get user by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireAuth(request);
    const db = getDb();
    const { id } = request.params;

    const found = await db
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

    if (!found.length) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return found[0];
  });

  // Update user. Users can update their own name/image.
  // Only admins can change role or update someone else.
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireAuth(request);
    const db = getDb();
    const { id } = request.params;
    const { name, role, image } = request.body as {
      name?: string;
      role?: string;
      image?: string | null;
    };

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

  // Delete user (admin only)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const me = requireRole(request, 'admin');
    const { id } = request.params;
    if (id === me.id) {
      return reply.status(400).send({ error: 'Cannot delete your own account' });
    }
    const db = getDb();
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    if (!result.length) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { success: true };
  });
};
