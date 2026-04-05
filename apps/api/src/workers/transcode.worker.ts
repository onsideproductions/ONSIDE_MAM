
import { eq } from 'drizzle-orm';
import { getDb, assets } from '../db/index.js';
import { transcodeToProxy, transcodeToHLS } from '../lib/ffmpeg.js';
import { createWorker, type TranscodeJobData, QUEUE_NAMES } from '../lib/queue.js';
import { getS3Client, getBucket, uploadToStorage, storageKey } from '../lib/storage.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const worker = createWorker<TranscodeJobData>(
  QUEUE_NAMES.TRANSCODE,
  async (job) => {
    const { assetId, inputKey, profile } = job.data;
    const db = getDb();

    job.log(`Transcoding asset ${assetId} with profile: ${profile}`);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mam-transcode-'));
    const tmpInput = path.join(tmpDir, 'input');

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

      job.updateProgress(20);

      if (profile === 'proxy') {
        // Transcode to proxy MP4
        const tmpOutput = path.join(tmpDir, 'proxy.mp4');
        await transcodeToProxy(tmpInput, tmpOutput);

        job.updateProgress(80);

        // Upload proxy to Wasabi
        const proxyData = await fs.readFile(tmpOutput);
        const proxyStorageKey = storageKey(assetId, 'proxy');
        await uploadToStorage(proxyStorageKey, proxyData, 'video/mp4');

        // Update asset
        await db
          .update(assets)
          .set({ proxyKey: proxyStorageKey, updatedAt: new Date() })
          .where(eq(assets.id, assetId));

        job.log('Proxy transcoding complete');
      } else if (profile === 'hls') {
        // Transcode to HLS
        const hlsDir = path.join(tmpDir, 'hls');
        await transcodeToHLS(tmpInput, hlsDir);

        job.updateProgress(80);

        // Upload all HLS files to Wasabi
        const hlsFiles = await fs.readdir(hlsDir);
        for (const file of hlsFiles) {
          const filePath = path.join(hlsDir, file);
          const fileData = await fs.readFile(filePath);
          const contentType = file.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/MP2T';
          await uploadToStorage(`hls/${assetId}/${file}`, fileData, contentType);
        }

        const hlsStorageKey = `hls/${assetId}/master.m3u8`;

        // Update asset
        await db
          .update(assets)
          .set({ hlsKey: hlsStorageKey, updatedAt: new Date() })
          .where(eq(assets.id, assetId));

        job.log('HLS transcoding complete');
      }

      job.updateProgress(100);

      // Check if all processing is done to mark asset as ready
      const asset = await db.query.assets.findFirst({
        where: eq(assets.id, assetId),
      });

      if (asset?.proxyKey && asset?.hlsKey && asset?.thumbnailKey) {
        await db
          .update(assets)
          .set({ status: 'ready', updatedAt: new Date() })
          .where(eq(assets.id, assetId));
        job.log('Asset marked as ready');
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  1 // Only 1 concurrent transcode to avoid overloading CPU
);

worker.on('completed', (job) => {
  console.log(`Transcoding completed for job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Transcoding failed for job ${job?.id}:`, err.message);
});

console.log('Transcode worker started');
