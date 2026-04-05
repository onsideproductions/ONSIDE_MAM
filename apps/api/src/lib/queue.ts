import { Queue, Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';

let _redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return _redis;
}

// Queue names
export const QUEUE_NAMES = {
  TRANSCODE: 'transcode',
  THUMBNAIL: 'thumbnail',
  METADATA: 'metadata',
  AI_ANALYSIS: 'ai-analysis',
} as const;

// Queue instances
const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: getRedis(),
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      })
    );
  }
  return queues.get(name)!;
}

export function createWorker<T>(
  name: string,
  processor: Processor<T>,
  concurrency = 1
): Worker<T> {
  return new Worker<T>(name, processor, {
    connection: getRedis(),
    concurrency,
  });
}

// Job data types
export interface TranscodeJobData {
  assetId: string;
  inputKey: string;
  profile: 'proxy' | 'hls';
}

export interface ThumbnailJobData {
  assetId: string;
  inputKey: string;
}

export interface MetadataJobData {
  assetId: string;
  inputKey: string;
}

export interface AiAnalysisJobData {
  assetId: string;
  thumbnailKey: string;
  inputKey: string;
}
