import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { getAuth } from '../lib/auth.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    session: AuthSession | null;
  }
}

/**
 * Decorates every request with `request.user` and `request.session` by
 * resolving the better-auth session cookie. Routes can then call
 * `requireAuth` / `requireRole` for protection.
 */
const sessionPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);

  app.addHook('preHandler', async (request) => {
    try {
      const auth = getAuth();
      const result = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (result?.user && result?.session) {
        request.user = result.user;
        request.session = result.session;
      }
    } catch (err) {
      // No session is fine - user just isn't logged in
      request.log.debug({ err }, 'session lookup failed');
    }
  });
};

export default fp(sessionPlugin, { name: 'session' });

/** Throws 401 if there is no logged-in user */
export function requireAuth(request: { user: AuthUser | null }) {
  if (!request.user) {
    const err = new Error('Unauthorized');
    (err as Error & { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return request.user;
}

/** Throws 403 if the user doesn't have one of the allowed roles */
export function requireRole(
  request: { user: AuthUser | null },
  ...allowed: string[]
) {
  const user = requireAuth(request);
  if (!allowed.includes(user.role)) {
    const err = new Error('Forbidden');
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
  return user;
}
