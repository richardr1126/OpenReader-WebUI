/**
 * Audio Conversion API Endpoint
 * 
 * This endpoint handles converting text to speech when direct TTS is not available from a provider.
 * It is primarily used as a fallback for providers like Ollama that don't have native TTS capabilities.
 */

import { NextRequest } from 'next/server';
import { createVoiceProvider } from '@/providers/factory';
import { ProviderSettings, VoiceProviderType, ProviderType } from '@/providers/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, voice, speed, provider, voiceProvider } = body;
    
    if (!text) {
      return Response.json({ error: 'Text is required' }, { status: 400 });
    }
    
    // Use the provided voice provider or default to OpenAI
    const effectiveVoiceProvider: VoiceProviderType = voiceProvider || 'openai';
    const effectiveProvider: ProviderType = provider || 'openai';
    
    // Extract API keys from headers if present
    const headers = new Headers(req.headers);
    const openaiKey = headers.get('x-openai-key') || '';
    const elevenLabsKey = headers.get('x-elevenlabs-key') || '';
    const openrouterKey = headers.get('x-openrouter-key') || '';
    
    // Create default provider settings
    let providerSettings: ProviderSettings = {
      openai: {
        apiKey: openaiKey,
        baseUrl: 'https://api.openai.com/v1',
        model: 'tts-1',
      },
      ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'llama3:8b',
      },
      openrouter: {
        apiKey: openrouterKey,
        model: 'openai/whisper',
      },
      elevenlabs: {
        apiKey: elevenLabsKey,
      },
    };
    
    // Parse provider settings from header if available
    try {
      const settingsHeader = headers.get('x-provider-settings');
      if (settingsHeader) {
        providerSettings = JSON.parse(settingsHeader);
      }
    } catch (error) {
      console.error('Error parsing provider settings:', error);
    }
    
    console.log(`Converting text to audio using provider: ${effectiveProvider}, voice provider: ${effectiveVoiceProvider}, speed: ${speed || 1.0}`);
    
    // Create voice provider for TTS generation
    const ttsProvider = createVoiceProvider(effectiveVoiceProvider, { 
      providerSettings
    });
    
    if (!ttsProvider) {
      throw new Error(`Failed to create voice provider for ${effectiveVoiceProvider}`);
    }
    
    // Ensure speed is a valid number
    const effectiveSpeed = typeof speed === 'string' ? parseFloat(speed) : 
                          typeof speed === 'number' ? speed : 1.0;
    
    // Generate speech from text
    const audioBuffer = await ttsProvider.generateSpeech({
      text,
      voice: voice || 'alloy',
      speed: effectiveSpeed,
      format: 'mp3',
    });
    
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('Generated audio buffer is empty');
    }
    
    // Return audio data
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="audio.mp3"`,
        'Cache-Control': 'private, max-age=604800', // Cache for a week
      },
    });
  } catch (error) {
    console.error('Error converting text to audio:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}