import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { assetRoutes } from './routes/assets.js';
import { authRoutes } from './routes/auth.js';
import { collectionRoutes } from './routes/collections.js';
import { searchRoutes } from './routes/search.js';
import { userRoutes } from './routes/users.js';
import { settingsRoutes } from './routes/settings.js';
import { shareRoutes, publicShareRoutes } from './routes/shares.js';
import { commentRoutes } from './routes/comments.js';
import { activityRoutes } from './routes/activity.js';
import { transcriptRoutes } from './routes/transcripts.js';
import { tusPlugin } from './plugins/tus.js';
import sessionPlugin from './plugins/session.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
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

  // Auth routes - register first so they don't get the global JSON parser
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Session decorator for downstream routes
  await app.register(sessionPlugin);

  // Upload (tus protocol)
  await app.register(tusPlugin);

  // API routes
  await app.register(assetRoutes, { prefix: '/api/assets' });
  await app.register(collectionRoutes, { prefix: '/api/collections' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(shareRoutes, { prefix: '/api/shares' });
  await app.register(publicShareRoutes, { prefix: '/api/public' });
  await app.register(commentRoutes, { prefix: '/api/comments' });
  await app.register(activityRoutes, { prefix: '/api/activity' });
  await app.register(transcriptRoutes, { prefix: '/api/transcripts' });

  return app;
}
