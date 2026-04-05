import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './config.js';

let _s3: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_s3) {
    const config = env();
    _s3 = new S3Client({
      region: config.WASABI_REGION,
      endpoint: config.WASABI_ENDPOINT,
      credentials: {
        accessKeyId: config.WASABI_ACCESS_KEY_ID,
        secretAccessKey: config.WASABI_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return _s3;
}

export function getBucket(): string {
  return env().WASABI_BUCKET;
}

export async function uploadToStorage(
  key: string,
  body: Buffer | ReadableStream,
  contentType: string
): Promise<void> {
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body as any,
      ContentType: contentType,
    })
  );
}

export async function deleteFromStorage(key: string): Promise<void> {
  const s3 = getS3Client();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
}

export async function getDownloadUrl(
  key: string,
  expiresIn = 3600,
  filename?: string
): Promise<string> {
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ...(filename && {
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getStreamUrl(
  key: string,
  expiresIn = 14400
): Promise<string> {
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getObjectHead(
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  const s3 = getS3Client();
  try {
    const result = await s3.send(
      new HeadObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/** Build the storage key for a given asset and file type */
export function storageKey(
  assetId: string,
  type: 'original' | 'proxy' | 'hls' | 'thumbnail' | 'sprite',
  filename?: string
): string {
  switch (type) {
    case 'original':
      return `originals/${assetId}/${filename || 'original'}`;
    case 'proxy':
      return `proxies/${assetId}/proxy.mp4`;
    case 'hls':
      return `hls/${assetId}/master.m3u8`;
    case 'thumbnail':
      return `thumbnails/${assetId}/poster.jpg`;
    case 'sprite':
      return `thumbnails/${assetId}/sprite.jpg`;
  }
}
