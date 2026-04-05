import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb, assets } from '../db/index.js';
import { probe } from '../lib/ffmpeg.js';
import { createWorker, type MetadataJobData, QUEUE_NAMES } from '../lib/queue.js';
import { getS3Client, getBucket } from '../lib/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const worker = createWorker<MetadataJobData>(
  QUEUE_NAMES.METADATA,
  async (job) => {
    const { assetId, inputKey } = job.data;
    const db = getDb();

    job.log(`Extracting metadata for asset ${assetId}`);

    // Download file to temp location for ffprobe
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mam-meta-'));
    const tmpFile = path.join(tmpDir, 'input');

    try {
      const s3 = getS3Client();
      const response = await s3.send(
        new GetObjectCommand({ Bucket: getBucket(), Key: inputKey })
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      await fs.writeFile(tmpFile, Buffer.concat(chunks));

      // Run ffprobe
      const metadata = await probe(tmpFile);

      // Update asset with metadata
      await db
        .update(assets)
        .set({
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          framerate: metadata.framerate,
          codec: metadata.codec,
          metadata: {
            audioCodec: metadata.audioCodec,
            bitrate: metadata.bitrate,
            format: metadata.format,
          },
          updatedAt: new Date(),
        })
        .where(eq(assets.id, assetId));

      job.log(`Metadata extracted: ${metadata.width}x${metadata.height}, ${metadata.duration}s`);
    } finally {
      // Cleanup temp files
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  2
);

worker.on('completed', (job) => {
  console.log(`Metadata extraction completed for job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Metadata extraction failed for job ${job?.id}:`, err.message);
});

console.log('Metadata worker started');
