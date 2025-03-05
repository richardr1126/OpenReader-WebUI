/**
 * TTS API Route
 * 
 * This API route handles requests to generate speech from text using various providers.
 */

import type { NextRequest } from 'next/server';
import { 
  createProvider, 
  createVoiceProvider 
} from '@/providers/factory';
import { 
  ProviderType, 
  VoiceProviderType, 
  ProviderSettings 
} from '@/providers/types';

/**
 * Handles requests to generate speech from text using the specified provider
 * 
 * @param req The incoming request
 * @returns A response containing the generated audio
 */
export async function POST(req: Request) {
  try {
    // Create a new abort controller for this request
    const controller = new AbortController();
    const { signal } = controller;
    
    // Get provider details from request body and headers
    const body = await req.json();
    const { 
      text, 
      voice, 
      speed,
      provider: bodyProvider,
      voiceProvider: bodyVoiceProvider,
      documentId
    } = body;
    
    // Check if provider is specified in body, otherwise use header
    const provider = (bodyProvider || new Headers(req.headers).get('x-provider') || 'openai') as ProviderType;
    const voiceProvider = (bodyVoiceProvider || new Headers(req.headers).get('x-voice-provider') || 'openai') as VoiceProviderType;
    
    // Parse provider settings from headers or use defaults
    let providerSettings: ProviderSettings = {
      openai: {
        apiKey: new Headers(req.headers).get('x-openai-key') || '',
        baseUrl: new Headers(req.headers).get('x-openai-base-url') || 'https://api.openai.com/v1',
        model: 'tts-1',
      },
      ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'llama3:8b',
      },
      openrouter: {
        apiKey: '',
        model: 'openai/whisper',
      },
      elevenlabs: {
        apiKey: '',
      },
    };
    
    try {
      const settingsHeader = new Headers(req.headers).get('x-provider-settings');
      if (settingsHeader) {
        providerSettings = JSON.parse(settingsHeader);
      }
    } catch (error) {
      console.error('Error parsing provider settings:', error);
    }
    
    // Validate request parameters
    if (!text) {
      return new Response(JSON.stringify({ error: 'Text is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!voice) {
      return new Response(JSON.stringify({ error: 'Voice is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Ensure speed is a valid number
    const effectiveSpeed = typeof speed === 'string' ? parseFloat(speed) : 
                          typeof speed === 'number' ? speed : 1.0;
    
    console.log(`Generating TTS with ${provider}/${voiceProvider} for text at speed ${effectiveSpeed}:`, text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    
    // Create the appropriate provider instance based on voice provider selection
    const ttsProvider = voiceProvider === 'elevenlabs' 
      ? createVoiceProvider(voiceProvider, { providerSettings })
      : createProvider(provider, { providerSettings });
    
    // Set timeout to abort long-running requests
    const timeout = setTimeout(() => {
      controller.abort();
      console.log('TTS request timed out');
    }, 30000); // 30 second timeout
    
    try {
      // Generate speech
      const audioBuffer = await ttsProvider.generateSpeech({
        text,
        voice,
        speed: effectiveSpeed,
      }, signal);
      
      clearTimeout(timeout);
      
      // Return audio as binary response
      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'private, max-age=604800', // Cache for a week
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      throw error; // Re-throw to be caught by the outer try/catch
    }
  } catch (error) {
    // Return error response
    console.error('Error generating TTS:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}