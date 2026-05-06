import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';
import { env } from './config.js';

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(env().GEMINI_API_KEY);
  }
  return _genAI;
}

export interface GeminiAnalysisResult {
  summary: string;
  sceneDescriptions: { timecode: number; description: string }[];
  detectedTags: string[];
  detectedObjects: string[];
  detectedText: string[];
  suggestedTitle: string | null;
}

/**
 * Analyze a video file using Gemini's vision capabilities.
 * Sends key frame thumbnails for analysis.
 */
export async function analyzeVideoFrames(
  framePaths: string[]
): Promise<GeminiAnalysisResult> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Read frame images and convert to inline data
  const imageParts = await Promise.all(
    framePaths.map(async (framePath) => {
      const data = await fs.readFile(framePath);
      return {
        inlineData: {
          data: data.toString('base64'),
          mimeType: 'image/jpeg',
        },
      };
    })
  );

  const prompt = `You are analyzing frames extracted from a video file for a Media Asset Management system.
These frames are taken at regular intervals throughout the video.

Analyze these frames and provide a JSON response with the following structure:
{
  "summary": "A 2-3 sentence description of the overall video content",
  "sceneDescriptions": [
    {"timecode": 0, "description": "Description of what's happening in this frame"}
  ],
  "detectedTags": ["tag1", "tag2"],
  "detectedObjects": ["object1", "object2"],
  "detectedText": ["any visible text or logos"],
  "suggestedTitle": "A suggested title for this video asset"
}

For detectedTags, include:
- Content type (interview, b-roll, event, documentary, sports, etc.)
- Location type (indoor, outdoor, studio, field, etc.)
- Lighting (natural, studio, low-light, etc.)
- Camera work (handheld, tripod, aerial, close-up, wide-shot, etc.)
- Subject matter keywords
- Mood/tone (energetic, calm, dramatic, etc.)

Be thorough with tags - the goal is to make this video easy to find later through search.
Return ONLY valid JSON, no markdown formatting.`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text();

  // Parse JSON from response (strip any markdown code blocks if present)
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  return {
    summary: parsed.summary || '',
    sceneDescriptions: parsed.sceneDescriptions || [],
    detectedTags: parsed.detectedTags || [],
    detectedObjects: parsed.detectedObjects || [],
    detectedText: parsed.detectedText || [],
    suggestedTitle: parsed.suggestedTitle || null,
  };
}

/**
 * Analyze a single thumbnail image (simpler/cheaper for quick analysis)
 */
export async function analyzeImage(
  imagePath: string
): Promise<GeminiAnalysisResult> {
  return analyzeVideoFrames([imagePath]);
}

export interface TranscribeResult {
  language: string;
  fullText: string;
  segments: { start: number; end: number; text: string }[];
}

/**
 * Transcribe audio with Gemini. Reads the audio file inline.
 * Suitable for files <20MB (about 30 minutes of 16kHz mono Opus at 24kbps).
 */
export async function transcribeAudio(
  audioPath: string,
  mimeType = 'audio/ogg'
): Promise<TranscribeResult> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const data = await fs.readFile(audioPath);

  const prompt = `Transcribe the spoken audio. Return ONLY valid JSON in this exact shape (no markdown, no commentary):
{
  "language": "ISO 639-1 code, e.g. en",
  "segments": [
    {"start": 0.0, "end": 4.2, "text": "First sentence."},
    {"start": 4.2, "end": 9.6, "text": "Second sentence."}
  ]
}

Rules:
- One segment per spoken sentence or natural pause (typically 2-15 seconds each).
- Timestamps in seconds with up to 2 decimals.
- Cover the entire audio without gaps.
- If there is no speech, return {"language": "en", "segments": []}.`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: data.toString('base64'),
        mimeType,
      },
    },
  ]);

  const text = result.response.text();
  const jsonStr = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
  const parsed = JSON.parse(jsonStr) as {
    language?: string;
    segments?: { start: number; end: number; text: string }[];
  };

  const segments = (parsed.segments ?? []).map((s) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: String(s.text || '').trim(),
  })).filter((s) => s.text);

  return {
    language: parsed.language || 'en',
    fullText: segments.map((s) => s.text).join(' '),
    segments,
  };
}
