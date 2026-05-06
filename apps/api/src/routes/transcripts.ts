import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, transcripts, assets } from '../db/index.js';
import { requireAuth, requireRole } from '../plugins/session.js';
import { getQueue, QUEUE_NAMES, type TranscribeJobData } from '../lib/queue.js';

export const transcriptRoutes: FastifyPluginAsync = async (app) => {
  // Get transcript for an asset
  app.get<{ Params: { assetId: string } }>('/asset/:assetId', async (request) => {
    requireAuth(request);
    const db = getDb();
    const { assetId } = request.params;
    const t = await db.query.transcripts.findFirst({
      where: eq(transcripts.assetId, assetId),
    });
    return t ?? null;
  });

  // (Re-)queue transcription (editor/admin)
  app.post<{ Params: { assetId: string } }>('/asset/:assetId', async (request, reply) => {
    requireRole(request, 'admin', 'editor');
    const db = getDb();
    const { assetId } = request.params;

    const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });

    await db
      .insert(transcripts)
      .values({ assetId, status: 'pending' })
      .onConflictDoUpdate({
        target: transcripts.assetId,
        set: { status: 'pending', errorMessage: null, updatedAt: new Date() },
      });

    const queue = getQueue(QUEUE_NAMES.TRANSCRIBE);
    await queue.add('transcribe', {
      assetId,
      inputKey: asset.storageKey,
    } satisfies TranscribeJobData);

    return { status: 'queued' };
  });
};
