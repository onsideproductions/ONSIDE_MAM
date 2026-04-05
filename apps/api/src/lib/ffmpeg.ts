import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';

const exec = promisify(execFile);

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  framerate: number;
  codec: string;
  audioCodec: string | null;
  bitrate: number;
  format: string;
}

/** Extract metadata from a video file using ffprobe */
export async function probe(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await exec('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);

  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
  const format = data.format;

  if (!videoStream) {
    throw new Error('No video stream found in file');
  }

  // Parse framerate from r_frame_rate (e.g., "30000/1001" or "25/1")
  const [num, den] = (videoStream.r_frame_rate || '0/1').split('/').map(Number);
  const framerate = den ? Math.round((num / den) * 100) / 100 : 0;

  return {
    duration: parseFloat(format?.duration || '0'),
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    framerate,
    codec: videoStream.codec_name || 'unknown',
    audioCodec: audioStream?.codec_name || null,
    bitrate: parseInt(format?.bit_rate || '0', 10),
    format: format?.format_name || 'unknown',
  };
}

/** Transcode to H.264 proxy MP4 */
export async function transcodeToProxy(
  inputPath: string,
  outputPath: string,
  options: { maxHeight?: number } = {}
): Promise<void> {
  const maxHeight = options.maxHeight || 720;
  const scaleFilter = `scale=-2:'min(${maxHeight},ih)'`;

  await exec('ffmpeg', [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-vf', scaleFilter,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ], { timeout: 600_000 }); // 10 min timeout
}

/** Generate HLS adaptive streaming output */
export async function transcodeToHLS(
  inputPath: string,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const masterPlaylist = path.join(outputDir, 'master.m3u8');

  // Single quality HLS for MVP (add multi-bitrate in Phase 2)
  await exec('ffmpeg', [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-vf', "scale=-2:'min(720,ih)'",
    '-c:a', 'aac',
    '-b:a', '128k',
    '-hls_time', '6',
    '-hls_list_size', '0',
    '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
    '-f', 'hls',
    masterPlaylist,
  ], { timeout: 600_000 });

  return masterPlaylist;
}

/** Generate a poster thumbnail at a specific time */
export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  options: { time?: number; width?: number } = {}
): Promise<void> {
  const time = options.time || 2; // 2 seconds in by default
  const width = options.width || 640;

  await exec('ffmpeg', [
    '-i', inputPath,
    '-ss', time.toString(),
    '-vframes', '1',
    '-vf', `scale=${width}:-2`,
    '-q:v', '3',
    '-y',
    outputPath,
  ]);
}

/** Generate a sprite sheet for scrubbing preview */
export async function generateSpriteSheet(
  inputPath: string,
  outputPath: string,
  options: { interval?: number; columns?: number; thumbWidth?: number } = {}
): Promise<{ cols: number; rows: number; interval: number }> {
  const interval = options.interval || 10; // Every 10 seconds
  const columns = options.columns || 10;
  const thumbWidth = options.thumbWidth || 160;

  // Get duration first
  const metadata = await probe(inputPath);
  const totalThumbs = Math.ceil(metadata.duration / interval);
  const rows = Math.ceil(totalThumbs / columns);

  await exec('ffmpeg', [
    '-i', inputPath,
    '-vf', `fps=1/${interval},scale=${thumbWidth}:-2,tile=${columns}x${rows}`,
    '-q:v', '5',
    '-y',
    outputPath,
  ], { timeout: 300_000 });

  return { cols: columns, rows, interval };
}
