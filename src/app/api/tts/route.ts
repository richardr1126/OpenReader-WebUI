import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SpeechCreateParams } from 'openai/resources/audio/speech.mjs';
import { isKokoroModel, stripVoiceWeights } from '@/utils/voice';

type CustomVoice = string;
type ExtendedSpeechParams = Omit<SpeechCreateParams, 'voice'> & {
  voice: SpeechCreateParams['voice'] | CustomVoice;
  instructions?: string;
};

export async function POST(req: NextRequest) {
  try {
    // Get API credentials from headers or fall back to environment variables
    const openApiKey = req.headers.get('x-openai-key') || process.env.API_KEY || 'none';
    const openApiBaseUrl = req.headers.get('x-openai-base-url') || process.env.API_BASE;
    const provider = req.headers.get('x-tts-provider') || 'openai';
    const { text, voice, speed, format, model, instructions } = await req.json();
    console.log('Received TTS request:', { provider, model, voice, speed, format, hasInstructions: Boolean(instructions) });

    if (!text || !voice || !speed) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Apply Deepinfra defaults if provider is deepinfra
    const finalModel = provider === 'deepinfra' && !model ? 'hexgrad/Kokoro-82M' : model;
    const initialVoice = provider === 'deepinfra' && !voice ? 'af_bella' : voice;

    // For SDK providers (OpenAI/Deepinfra), preserve multi-voice for Kokoro models, otherwise normalize to first token
    const isKokoro = isKokoroModel(finalModel);
    let normalizedVoice = initialVoice;
    if (!isKokoro && typeof normalizedVoice === 'string' && normalizedVoice.includes('+')) {
      normalizedVoice = stripVoiceWeights(normalizedVoice.split('+')[0]);
      console.log('Normalized multi-voice to single for non-Kokoro SDK provider:', normalizedVoice);
    }

    // Initialize OpenAI client with abort signal (OpenAI/deepinfra)
    const openai = new OpenAI({
      apiKey: openApiKey,
      baseURL: openApiBaseUrl,
    });

    // Unified path: all providers (openai, deepinfra, custom-openai) go through the SDK below.

    // Request audio from OpenAI and pass along the abort signal
    const createParams: ExtendedSpeechParams = {
      model: finalModel || 'tts-1',
      voice: normalizedVoice as SpeechCreateParams['voice'],
      input: text,
      speed: speed,
      response_format: format === 'aac' ? 'aac' : 'mp3',
    };

    // Only add instructions if model is gpt-4o-mini-tts and instructions are provided
    if (finalModel === 'gpt-4o-mini-tts' && instructions) {
      createParams.instructions = instructions;
    }

    const response = await openai.audio.speech.create(createParams as SpeechCreateParams, { signal: req.signal });

    // Read the audio data as an ArrayBuffer and return it with appropriate headers
    // This will also be aborted if the client cancels
    const buffer = await response.arrayBuffer();
    const contentType = format === 'aac' ? 'audio/aac' : 'audio/mpeg';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType
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