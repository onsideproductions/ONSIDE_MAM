import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { assetRoutes } from './routes/assets.js';
import { authRoutes } from './routes/auth.js';
import { collectionRoutes } from './routes/collections.js';
import { searchRoutes } from './routes/search.js';
import { userRoutes } from './routes/users.js';
import { tusPlugin } from './plugins/tus.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    maxParamLength: 200,
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  });

  await app.register(websocket);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // Upload (tus protocol)
  await app.register(tusPlugin);

  // API routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(assetRoutes, { prefix: '/api/assets' });
  await app.register(collectionRoutes, { prefix: '/api/collections' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(userRoutes, { prefix: '/api/users' });

  return app;
}
