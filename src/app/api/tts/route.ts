import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SpeechCreateParams } from 'openai/resources/audio/speech.mjs';
import { isKokoroModel } from '@/utils/voice';
import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import type { TTSRequestPayload } from '@/types/client';
import type { TTSError, TTSAudioBuffer } from '@/types/tts';

export const runtime = 'nodejs';

type CustomVoice = string;
type ExtendedSpeechParams = Omit<SpeechCreateParams, 'voice'> & {
  voice: SpeechCreateParams['voice'] | CustomVoice;
  instructions?: string;
};
type AudioBufferValue = TTSAudioBuffer;

const TTS_CACHE_MAX_SIZE_BYTES = Number(process.env.TTS_CACHE_MAX_SIZE_BYTES || 256 * 1024 * 1024); // 256MB
const TTS_CACHE_TTL_MS = Number(process.env.TTS_CACHE_TTL_MS || 1000 * 60 * 30); // 30 minutes

const ttsAudioCache = new LRUCache<string, AudioBufferValue>({
  maxSize: TTS_CACHE_MAX_SIZE_BYTES,
  sizeCalculation: (value) => value.byteLength,
  ttl: TTS_CACHE_TTL_MS,
});

type InflightEntry = {
  promise: Promise<TTSAudioBuffer>;
  controller: AbortController;
  consumers: number;
};

const inflightRequests = new Map<string, InflightEntry>();

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchTTSBufferWithRetry(
  openai: OpenAI,
  createParams: ExtendedSpeechParams,
  signal: AbortSignal
): Promise<TTSAudioBuffer> {
  let attempt = 0;
  const maxRetries = Number(process.env.TTS_MAX_RETRIES ?? 2);
  let delay = Number(process.env.TTS_RETRY_INITIAL_MS ?? 250);
  const maxDelay = Number(process.env.TTS_RETRY_MAX_MS ?? 2000);
  const backoff = Number(process.env.TTS_RETRY_BACKOFF ?? 2);

  // Retry on 429 and 5xx only; never retry aborts
  for (;;) {
    try {
      const response = await openai.audio.speech.create(createParams as SpeechCreateParams, { signal });
      return await response.arrayBuffer();
    } catch (err: unknown) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw err;
      }
      const status = (() => {
        if (typeof err === 'object' && err !== null) {
          const rec = err as Record<string, unknown>;
          if (typeof rec.status === 'number') return rec.status as number;
          if (typeof rec.statusCode === 'number') return rec.statusCode as number;
        }
        return 0;
      })();
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw err;
      }
      await sleep(Math.min(delay, maxDelay));
      delay = Math.min(maxDelay, delay * backoff);
      attempt += 1;
    }
  }
}

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
    const provider = req.headers.get('x-tts-provider') || 'openai';

    // Get API key and base URL based on provider
    let apiKey = req.headers.get('x-openai-key') || '';
    let baseUrl = req.headers.get('x-openai-base-url') || '';

    if (!apiKey) {
      switch (provider) {
        case 'groq':
          apiKey = process.env.GROQ_API_KEY || '';
          break;
        case 'openai':
          apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY || 'none';
          break;
        default:
          apiKey = process.env.API_KEY || 'none';
          break;
      }
    }

    if (!baseUrl) {
      switch (provider) {
        case 'groq':
          baseUrl = 'https://api.groq.com/openai/v1';
          break;
        case 'deepinfra':
          baseUrl = process.env.API_BASE || 'https://api.deepinfra.com/v1/openai';
          break;
        default:
          baseUrl = process.env.API_BASE || undefined as unknown as string;
          break;
      }
    }

    const body = (await req.json()) as TTSRequestPayload;
    const { text, voice, speed, format, model: req_model, instructions } = body;
    console.log('Received TTS request:', { provider, req_model, voice, speed, format, hasInstructions: Boolean(instructions) });

    if (!text || !voice || !speed) {
      const errorBody: TTSError = {
        code: 'MISSING_PARAMETERS',
        message: 'Missing required parameters',
      };
      return NextResponse.json(errorBody, { status: 400 });
    }

    // Set default model based on provider
    let rawModel = req_model;
    if (!rawModel) {
      switch (provider) {
        case 'deepinfra':
          rawModel = 'hexgrad/Kokoro-82M';
          break;
        case 'groq':
          rawModel = 'canopylabs/orpheus-v1-english';
          break;
        default:
          rawModel = 'gpt-4o-mini-tts';
          break;
      }
    }
    const model: SpeechCreateParams['model'] = rawModel as SpeechCreateParams['model'];

    // Initialize OpenAI client (works with OpenAI-compatible APIs)
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl || undefined,
    });

    const normalizedVoice = (
      !isKokoroModel(model as string) && voice.includes('+')
      ? (voice.split('+')[0].trim())
      : voice
    ) as SpeechCreateParams['voice'];
    
    // Groq Orpheus models only support WAV format
    const actualFormat = provider === 'groq' ? 'wav' : format;

    const createParams: ExtendedSpeechParams = {
      model: model,
      voice: normalizedVoice,
      input: text,
      speed: speed,
      response_format: actualFormat,
    };
    // Only add instructions if model is gpt-4o-mini-tts and instructions are provided
    if ((model as string) === 'gpt-4o-mini-tts' && instructions) {
      createParams.instructions = instructions;
    }

    // Compute cache key and check LRU before making provider call
    const contentType = actualFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';

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

    const etag = `W/"${cacheKey}"`;
    const ifNoneMatch = req.headers.get('if-none-match');

    const cachedBuffer = ttsAudioCache.get(cacheKey);
    if (cachedBuffer) {
      if (ifNoneMatch && (ifNoneMatch.includes(cacheKey) || ifNoneMatch.includes(etag))) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'ETag': etag,
            'Cache-Control': 'private, max-age=1800',
            'Vary': 'x-tts-provider, x-openai-key, x-openai-base-url'
          }
        });
      }
      console.log('TTS cache HIT for key:', cacheKey.slice(0, 8));
      return new NextResponse(cachedBuffer, {
        headers: {
          'Content-Type': contentType,
          'X-Cache': 'HIT',
          'ETag': etag,
          'Content-Length': String(cachedBuffer.byteLength),
          'Cache-Control': 'private, max-age=1800',
          'Vary': 'x-tts-provider, x-openai-key, x-openai-base-url'
        }
      });
    }

    // De-duplicate identical in-flight requests
    const existing = inflightRequests.get(cacheKey);
    if (existing) {
      console.log('TTS in-flight JOIN for key:', cacheKey.slice(0, 8));
      existing.consumers += 1;

      const onAbort = () => {
        existing.consumers = Math.max(0, existing.consumers - 1);
        if (existing.consumers === 0) {
          existing.controller.abort();
        }
      };
      req.signal.addEventListener('abort', onAbort, { once: true });

      try {
        const buffer = await existing.promise;
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'X-Cache': 'INFLIGHT',
            'ETag': etag,
            'Content-Length': String(buffer.byteLength),
            'Cache-Control': 'private, max-age=1800',
            'Vary': 'x-tts-provider, x-openai-key, x-openai-base-url'
          }
        });
      } finally {
        try { req.signal.removeEventListener('abort', onAbort); } catch {}
      }
    }

    const controller = new AbortController();
    const entry: InflightEntry = {
      controller,
      consumers: 1,
      promise: (async () => {
        try {
          const buffer = await fetchTTSBufferWithRetry(openai, createParams, controller.signal);
          // Save to cache
          ttsAudioCache.set(cacheKey, buffer);
          return buffer;
        } finally {
          inflightRequests.delete(cacheKey);
        }
      })()
    };

    inflightRequests.set(cacheKey, entry);

    const onAbort = () => {
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (entry.consumers === 0) {
        entry.controller.abort();
      }
    };
    req.signal.addEventListener('abort', onAbort, { once: true });

    let buffer: TTSAudioBuffer;
    try {
      buffer = await entry.promise;
    } finally {
      try { req.signal.removeEventListener('abort', onAbort); } catch {}
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'X-Cache': 'MISS',
        'ETag': etag,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=1800',
        'Vary': 'x-tts-provider, x-openai-key, x-openai-base-url'
      }
    });
  } catch (error) {
    // Check if this was an abort error
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('TTS request aborted by client');
      return new NextResponse(null, { status: 499 }); // Use 499 status for client closed request
    }

    console.warn('Error generating TTS:', error);
    const errorBody: TTSError = {
      code: 'TTS_GENERATION_FAILED',
      message: 'Failed to generate audio',
      details: process.env.NODE_ENV !== 'production' ? String(error) : undefined,
    };
    return NextResponse.json(
      errorBody,
      { status: 500 }
    );
  }
}
