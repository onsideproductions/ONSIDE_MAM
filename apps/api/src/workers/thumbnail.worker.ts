
import { eq } from 'drizzle-orm';
import { getDb, assets } from '../db/index.js';
import { generateThumbnail, generateSpriteSheet } from '../lib/ffmpeg.js';
import {
  createWorker,
  type ThumbnailJobData,
  type AiAnalysisJobData,
  QUEUE_NAMES,
  getQueue,
} from '../lib/queue.js';
import { getS3Client, getBucket, uploadToStorage, storageKey } from '../lib/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const worker = createWorker<ThumbnailJobData>(
  QUEUE_NAMES.THUMBNAIL,
  async (job) => {
    const { assetId, inputKey } = job.data;
    const db = getDb();

    job.log(`Generating thumbnails for asset ${assetId}`);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mam-thumb-'));
    const tmpInput = path.join(tmpDir, 'input');
    const tmpPoster = path.join(tmpDir, 'poster.jpg');
    const tmpSprite = path.join(tmpDir, 'sprite.jpg');

    try {
      // Download source file
      const s3 = getS3Client();
      const response = await s3.send(
        new GetObjectCommand({ Bucket: getBucket(), Key: inputKey })
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      await fs.writeFile(tmpInput, Buffer.concat(chunks));

      // Generate poster thumbnail
      await generateThumbnail(tmpInput, tmpPoster, { width: 640 });
      const posterData = await fs.readFile(tmpPoster);
      const posterKey = storageKey(assetId, 'thumbnail');
      await uploadToStorage(posterKey, posterData, 'image/jpeg');

      job.updateProgress(50);

      // Generate sprite sheet
      const spriteInfo = await generateSpriteSheet(tmpInput, tmpSprite);
      const spriteData = await fs.readFile(tmpSprite);
      const spriteStorageKey = storageKey(assetId, 'sprite');
      await uploadToStorage(spriteStorageKey, spriteData, 'image/jpeg');

      // Update asset
      await db
        .update(assets)
        .set({
          thumbnailKey: posterKey,
          spriteKey: spriteStorageKey,
          metadata: {
            spriteInfo,
          },
          updatedAt: new Date(),
        })
        .where(eq(assets.id, assetId));

      job.updateProgress(100);

      // Queue AI analysis now that we have a thumbnail
      const aiQueue = getQueue(QUEUE_NAMES.AI_ANALYSIS);
      await aiQueue.add('analyze', {
        assetId,
        thumbnailKey: posterKey,
        inputKey,
      } satisfies AiAnalysisJobData);

      job.log('Thumbnails generated and AI analysis queued');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  2
);

worker.on('completed', (job) => {
  console.log(`Thumbnail generation completed for job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Thumbnail generation failed for job ${job?.id}:`, err.message);
});

console.log('Thumbnail worker started');
