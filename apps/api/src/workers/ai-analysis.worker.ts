import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getDb, assets, aiAnalysis, tags, assetTags } from '../db/index.js';
import { analyzeVideoFrames } from '../lib/gemini.js';
import { generateThumbnail } from '../lib/ffmpeg.js';
import { createWorker, type AiAnalysisJobData, QUEUE_NAMES } from '../lib/queue.js';
import { getS3Client, getBucket } from '../lib/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const worker = createWorker<AiAnalysisJobData>(
  QUEUE_NAMES.AI_ANALYSIS,
  async (job) => {
    const { assetId, inputKey } = job.data;
    const db = getDb();

    job.log(`Starting AI analysis for asset ${assetId}`);

    // Create or update AI analysis record
    await db
      .insert(aiAnalysis)
      .values({ assetId, status: 'processing' })
      .onConflictDoUpdate({
        target: aiAnalysis.assetId,
        set: { status: 'processing' },
      });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mam-ai-'));
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

      // Extract frames at regular intervals for analysis
      // Get asset duration
      const asset = await db.query.assets.findFirst({
        where: eq(assets.id, assetId),
      });

      const duration = asset?.duration || 60;
      const frameCount = Math.min(8, Math.max(3, Math.ceil(duration / 15))); // 3-8 frames
      const interval = duration / (frameCount + 1);

      const framePaths: string[] = [];
      for (let i = 1; i <= frameCount; i++) {
        const time = interval * i;
        const framePath = path.join(tmpDir, `frame_${i}.jpg`);
        await generateThumbnail(tmpInput, framePath, { time, width: 1280 });
        framePaths.push(framePath);
      }

      job.updateProgress(50);
      job.log(`Extracted ${framePaths.length} frames, sending to Gemini`);

      // Analyze with Gemini
      const analysis = await analyzeVideoFrames(framePaths);

      job.updateProgress(80);

      // Save analysis results
      await db
        .update(aiAnalysis)
        .set({
          status: 'completed',
          summary: analysis.summary,
          sceneDescriptions: analysis.sceneDescriptions,
          detectedTags: analysis.detectedTags,
          detectedObjects: analysis.detectedObjects,
          detectedText: analysis.detectedText,
          rawResponse: analysis as any,
          modelUsed: 'gemini-2.0-flash',
          analyzedAt: new Date(),
        })
        .where(eq(aiAnalysis.assetId, assetId));

      // Auto-create tags from AI detection and link to asset
      const allTags = [
        ...analysis.detectedTags,
        ...analysis.detectedObjects.slice(0, 10), // Top 10 objects as tags
      ];

      for (const tagName of allTags) {
        const normalizedName = tagName.toLowerCase().trim();
        if (!normalizedName) continue;

        // Upsert tag
        const existing = await db.query.tags.findFirst({
          where: eq(tags.name, normalizedName),
        });

        let tagId: string;
        if (existing) {
          tagId = existing.id;
        } else {
          const [newTag] = await db
            .insert(tags)
            .values({ name: normalizedName })
            .returning();
          tagId = newTag.id;
        }

        // Link to asset
        await db
          .insert(assetTags)
          .values({ assetId, tagId })
          .onConflictDoNothing();
      }

      // Update asset description if empty
      if (asset && !asset.description && analysis.summary) {
        await db
          .update(assets)
          .set({
            description: analysis.summary,
            updatedAt: new Date(),
          })
          .where(eq(assets.id, assetId));
      }

      job.updateProgress(100);
      job.log(`AI analysis complete: ${allTags.length} tags generated`);
    } catch (err) {
      // Mark analysis as failed but don't fail the entire pipeline
      await db
        .update(aiAnalysis)
        .set({ status: 'error' })
        .where(eq(aiAnalysis.assetId, assetId));
      throw err;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  2
);

worker.on('completed', (job) => {
  console.log(`AI analysis completed for job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`AI analysis failed for job ${job?.id}:`, err.message);
});

console.log('AI analysis worker started');
