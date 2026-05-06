import { eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getDb, transcripts } from '../db/index.js';
import {
  createWorker,
  QUEUE_NAMES,
  type TranscribeJobData,
} from '../lib/queue.js';
import { getS3Client, getBucket } from '../lib/storage.js';
import { extractAudioForTranscription } from '../lib/ffmpeg.js';
import { transcribeAudio } from '../lib/gemini.js';

const worker = createWorker<TranscribeJobData>(
  QUEUE_NAMES.TRANSCRIBE,
  async (job) => {
    const { assetId, inputKey } = job.data;
    const db = getDb();

    job.log(`Transcribing asset ${assetId}`);

    // Mark as processing
    await db
      .insert(transcripts)
      .values({ assetId, status: 'processing' })
      .onConflictDoUpdate({
        target: transcripts.assetId,
        set: { status: 'processing', errorMessage: null, updatedAt: new Date() },
      });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mam-transcribe-'));
    const tmpInput = path.join(tmpDir, 'input');
    const tmpAudio = path.join(tmpDir, 'audio.ogg');

    try {
      // Download source from Wasabi
      const s3 = getS3Client();
      const response = await s3.send(
        new GetObjectCommand({ Bucket: getBucket(), Key: inputKey })
      );
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      await fs.writeFile(tmpInput, Buffer.concat(chunks));

      job.updateProgress(20);
      job.log('Extracting audio');

      await extractAudioForTranscription(tmpInput, tmpAudio);

      const stat = await fs.stat(tmpAudio);
      const sizeMB = stat.size / 1024 / 1024;
      job.log(`Audio extracted (${sizeMB.toFixed(1)}MB), sending to Gemini`);

      if (sizeMB > 19) {
        // Gemini inline limit is ~20MB. Could chunk in future; for now fail.
        throw new Error(
          `Audio too large for inline transcription (${sizeMB.toFixed(1)}MB). Try a shorter video.`
        );
      }

      job.updateProgress(50);

      const result = await transcribeAudio(tmpAudio, 'audio/ogg');

      await db
        .update(transcripts)
        .set({
          language: result.language,
          fullText: result.fullText,
          segments: result.segments,
          status: 'completed',
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(transcripts.assetId, assetId));

      job.updateProgress(100);
      job.log(`Transcription complete (${result.segments.length} segments)`);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      await db
        .update(transcripts)
        .set({
          status: 'failed',
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(transcripts.assetId, assetId));
      throw err;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  1
);

worker.on('completed', (job) => {
  console.log(`Transcription completed for job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Transcription failed for job ${job?.id}:`, err.message);
});

console.log('Transcribe worker started');
