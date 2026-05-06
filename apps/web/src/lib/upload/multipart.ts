/**
 * Parallel multipart uploader.
 *
 * 1. Asks the API for an uploadId and presigned URLs for every part.
 * 2. Uploads parts in parallel directly to Wasabi (PUT to the presigned URLs).
 * 3. Calls the API to complete the multipart upload with the part ETags.
 *
 * No data goes through our origin server, so upload speed is gated only by
 * the user's connection and Wasabi's ingress.
 */

const DEFAULT_PART_SIZE = 16 * 1024 * 1024; // 16MB - good balance for resumable + few requests
const MIN_PART_SIZE = 5 * 1024 * 1024; // S3 minimum (except last part)
const DEFAULT_CONCURRENCY = 6; // sweet spot for most home/office connections

export interface UploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
  partsCompleted: number;
  partsTotal: number;
}

export interface InitResponse {
  assetId: string;
  uploadId: string;
  key: string;
  partUrls: { partNumber: number; url: string }[];
  partSize: number;
}

interface UploadOptions {
  file: File;
  partSize?: number;
  concurrency?: number;
  versionOf?: string;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** Pick a part size so we don't exceed the 10000-part S3 limit */
function chooseParts(file: File, requested: number): { partSize: number; numParts: number } {
  let partSize = Math.max(requested, MIN_PART_SIZE);
  let numParts = Math.ceil(file.size / partSize);
  while (numParts > 10000) {
    partSize *= 2;
    numParts = Math.ceil(file.size / partSize);
  }
  return { partSize, numParts };
}

async function uploadPart(
  url: string,
  blob: Blob,
  signal: AbortSignal | undefined,
  onProgress: (bytes: number) => void
): Promise<string> {
  // We use XHR rather than fetch so we get progress events
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('etag') ?? xhr.getResponseHeader('ETag') ?? '';
        if (!etag) {
          reject(new Error('No ETag in upload response. Wasabi CORS may not be configured.'));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`Part upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during part upload'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(blob);
  });
}

export async function uploadFile(opts: UploadOptions): Promise<{ assetId: string }> {
  const { file, versionOf, onProgress, signal } = opts;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const { partSize } = chooseParts(file, opts.partSize ?? DEFAULT_PART_SIZE);

  // 1. Init
  const initRes = await fetch('/api/uploads/init', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'video/mp4',
      fileSize: file.size,
      partSize,
      versionOf,
    }),
    signal,
  });

  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to initialize upload');
  }
  const init = (await initRes.json()) as InitResponse;

  // 2. Upload parts in parallel
  const completed: CompletedPart[] = [];
  const partsTotal = init.partUrls.length;
  const partProgress = new Array<number>(partsTotal).fill(0);

  function reportProgress() {
    if (!onProgress) return;
    const bytesUploaded = partProgress.reduce((a, b) => a + b, 0);
    onProgress({
      bytesUploaded,
      bytesTotal: file.size,
      percent: Math.round((bytesUploaded / file.size) * 100),
      partsCompleted: completed.length,
      partsTotal,
    });
  }

  // Pool of worker promises
  const queue = [...init.partUrls];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const i = nextIndex++;
      if (i >= queue.length) return;
      const { partNumber, url } = queue[i];
      const start = (partNumber - 1) * init.partSize;
      const end = Math.min(start + init.partSize, file.size);
      const blob = file.slice(start, end);

      const partIdx = partNumber - 1;
      let etag = '';
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          etag = await uploadPart(url, blob, signal, (bytes) => {
            partProgress[partIdx] = bytes;
            reportProgress();
          });
          break;
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
          lastErr = err;
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
      if (!etag) throw lastErr ?? new Error('Part upload failed after retries');

      partProgress[partIdx] = blob.size;
      completed.push({ partNumber, etag });
      reportProgress();
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, partsTotal) }, () => worker())
    );
  } catch (err) {
    // Best-effort abort on the server side; ignore failures
    fetch('/api/uploads/abort', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: init.assetId,
        uploadId: init.uploadId,
        key: init.key,
      }),
    }).catch(() => {});
    throw err;
  }

  // 3. Complete
  const completeRes = await fetch('/api/uploads/complete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetId: init.assetId,
      uploadId: init.uploadId,
      key: init.key,
      parts: completed,
      versionOf,
    }),
  });
  if (!completeRes.ok) {
    const data = await completeRes.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to complete upload');
  }

  return { assetId: init.assetId };
}
