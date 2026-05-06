import type { FastifyPluginAsync } from 'fastify';
import { getAuth } from '../lib/auth.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const auth = getAuth();

  // Pass JSON bodies through as raw strings so we can hand them to better-auth.
  // Scoped to this plugin (Fastify encapsulation).
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => done(null, body)
  );

  // Forward all auth requests to better-auth (Web API style).
  app.all('/*', async (request, reply) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host || 'localhost'}`
      );

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.append(key, String(value));
        }
      }

      const init: RequestInit = {
        method: request.method,
        headers,
      };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = (request.body as string) ?? undefined;
      }

      const webReq = new Request(url.toString(), init);
      const response = await auth.handler(webReq);

      reply.status(response.status);
      response.headers.forEach((value: string, key: string) => {
        reply.header(key, value);
      });
      const text = await response.text();
      return reply.send(text || undefined);
    } catch (err) {
      app.log.error({ err }, 'auth handler error');
      return reply.status(500).send({ error: 'Authentication error' });
    }
  });
};
