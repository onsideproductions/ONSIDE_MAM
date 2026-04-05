import type { FastifyPluginAsync } from 'fastify';
import { getAuth } from '../lib/auth.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const auth = getAuth();

  // Forward all auth requests to better-auth
  app.all('/*', async (request, reply) => {
    const response = await auth.handler(request.raw as any);

    // Forward status code
    reply.status(response.status);

    // Forward headers
    response.headers.forEach((value: string, key: string) => {
      reply.header(key, value);
    });

    // Forward body
    if (response.body) {
      const text = await response.text();
      return reply.send(text);
    }

    return reply.send();
  });
};
