import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SpeechCreateParams } from 'openai/resources/audio/speech.mjs';

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
    console.log('Received TTS request:', text, voice, speed, format, model);

    if (!openApiKey) {
      return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 401 });
    }

    if (!text || !voice || !speed) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Apply Deepinfra defaults if provider is deepinfra
    const finalModel = provider === 'deepinfra' && !model ? 'hexgrad/Kokoro-82M' : model;
    const finalVoice = provider === 'deepinfra' && !voice ? 'af_bella' : voice;

    // Initialize OpenAI client with abort signal
    const openai = new OpenAI({
      apiKey: openApiKey,
      baseURL: openApiBaseUrl,
    });

    // Request audio from OpenAI and pass along the abort signal
    const createParams: ExtendedSpeechParams = {
      model: finalModel || 'tts-1',
      voice: finalVoice as "alloy",
      input: text,
      speed: speed,
      response_format: format === 'aac' ? 'aac' : 'mp3',
    };

    // Only add instructions if model is gpt-4o-mini-tts and instructions are provided
    if (finalModel === 'gpt-4o-mini-tts' && instructions) {
      createParams.instructions = instructions;
    }

    const response = await openai.audio.speech.create(createParams as SpeechCreateParams, { signal: req.signal });

    // Get the audio data as array buffer
    // This will also be aborted if the client cancels
    const stream = response.body;

    // Return audio data with appropriate headers
    const contentType = format === 'aac' ? 'audio/aac' : 'audio/mpeg';
    return new NextResponse(stream, {
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