import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SpeechCreateParams } from 'openai/resources/audio/speech.mjs';
import { isKokoroModel } from '@/utils/voice';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

type CustomVoice = string;
type ExtendedSpeechParams = Omit<SpeechCreateParams, 'voice'> & {
  voice: SpeechCreateParams['voice'] | CustomVoice;
  instructions?: string;
};
type AudioBufferValue = ArrayBuffer;

const TTS_CACHE_MAX_SIZE_BYTES = Number(process.env.TTS_CACHE_MAX_SIZE_BYTES || 256 * 1024 * 1024); // 256MB
const TTS_CACHE_TTL_MS = Number(process.env.TTS_CACHE_TTL_MS || 1000 * 60 * 30); // 30 minutes

const ttsAudioCache = new LRUCache<string, AudioBufferValue>({
  maxSize: TTS_CACHE_MAX_SIZE_BYTES,
  sizeCalculation: (value) => value.byteLength,
  ttl: TTS_CACHE_TTL_MS,
});

function makeCacheKey(input: {
  provider: string;
  model: string | null | undefined;
  voice: string | undefined;
  speed: number;
  format: string;
  text: string;
  instructions?: string;
}) {
  const canonical = {
    provider: input.provider,
    model: input.model || '',
    voice: input.voice || '',
    speed: input.speed,
    format: input.format,
    text: input.text,
    // Only include instructions when present (for models like gpt-4o-mini-tts)
    instructions: input.instructions || undefined,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    // Get API credentials from headers or fall back to environment variables
    const openApiKey = req.headers.get('x-openai-key') || process.env.API_KEY || 'none';
    const openApiBaseUrl = req.headers.get('x-openai-base-url') || process.env.API_BASE;
    const provider = req.headers.get('x-tts-provider') || 'openai';
    const { text, voice, speed, format, model: req_model, instructions } = await req.json();
    console.log('Received TTS request:', { provider, req_model, voice, speed, format, hasInstructions: Boolean(instructions) });

    if (!text || !voice || !speed) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    // Use default Kokoro model for Deepinfra if none specified
    const model = provider === 'deepinfra' && !req_model ? 'hexgrad/Kokoro-82M' : req_model;

    // Initialize OpenAI client with abort signal (OpenAI/deepinfra)
    const openai = new OpenAI({
      apiKey: openApiKey,
      baseURL: openApiBaseUrl,
    });

    const normalizedVoice = (
      !isKokoroModel(model) && voice.includes('+')
      ? (voice.split('+')[0].trim())
      : voice
    ) as SpeechCreateParams['voice'];
    
    const createParams: ExtendedSpeechParams = {
      model: model,
      voice: normalizedVoice,
      input: text,
      speed: speed,
      response_format: format === 'aac' ? 'aac' : 'mp3',
    };
    // Only add instructions if model is gpt-4o-mini-tts and instructions are provided
    if (model === 'gpt-4o-mini-tts' && instructions) {
      createParams.instructions = instructions;
    }

    // Compute cache key and check LRU before making provider call
    const contentType = format === 'aac' ? 'audio/aac' : 'audio/mpeg';

    // Preserve voice string as-is for cache key (no weight stripping)
    const voiceForKey = typeof createParams.voice === 'string'
      ? createParams.voice
      : String(createParams.voice);

    const cacheKey = makeCacheKey({
      provider,
      model: createParams.model,
      voice: voiceForKey,
      speed: Number(createParams.speed),
      format: String(createParams.response_format),
      text,
      instructions: createParams.instructions,
    });

    const cachedBuffer = ttsAudioCache.get(cacheKey);
    if (cachedBuffer) {
      console.log('TTS cache HIT for key:', cacheKey.slice(0, 8));
      return new NextResponse(cachedBuffer, {
        headers: {
          'Content-Type': contentType,
          'X-Cache': 'HIT',
        }
      });
    }

    const response = await openai.audio.speech.create(createParams as SpeechCreateParams, { signal: req.signal });

    // Read the audio data as an ArrayBuffer and return it with appropriate headers
    // This will also be aborted if the client cancels
    const buffer = await response.arrayBuffer();

    // Save to cache
    ttsAudioCache.set(cacheKey, buffer);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'X-Cache': 'MISS'
      }
    });
  } catch (error) {
    // Check if this was an abort error
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('TTS request aborted by client');
      return new NextResponse(null, { status: 499 }); // Use 499 status for client closed request
    }

    console.warn('Error generating TTS:', error);
    return NextResponse.json(
      { error: 'Failed to generate audio' },
      { status: 500 }
    );
  }
}