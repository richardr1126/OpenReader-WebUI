/**
 * Voices API Route
 * 
 * This API route handles requests to fetch available voices from various providers.
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
 * Handles requests to fetch available voices from specified provider
 * 
 * @param req The incoming request
 * @returns A response containing the available voices and categories
 */
export async function GET(req: Request) {
  try {
    const headers = new Headers(req.headers);
    
    // Get provider details from headers
    const provider = (headers.get('x-provider') || 'openai') as ProviderType;
    const voiceProvider = (headers.get('x-voice-provider') || 'openai') as VoiceProviderType;
    
    // Parse provider settings from headers
    let providerSettings: ProviderSettings = {
      openai: {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
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
      const settingsHeader = headers.get('x-provider-settings');
      if (settingsHeader) {
        providerSettings = JSON.parse(settingsHeader);
      }
    } catch (error) {
      console.error('Error parsing provider settings:', error);
    }
    
    console.log(`Fetching voices for ${voiceProvider} provider...`);
    
    // Create the appropriate provider instance
    const ttsProvider = voiceProvider === 'elevenlabs' 
      ? createVoiceProvider(voiceProvider, { providerSettings })
      : createProvider(provider, { providerSettings });
      
    // Fetch voices and categories
    const [voices, categories] = await Promise.all([
      ttsProvider.getAvailableVoices(),
      ttsProvider.getVoiceCategories()
    ]);
    
    return new Response(
      JSON.stringify({ voices, categories }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error getting voices:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}