/**
 * OpenRouter Provider Implementation
 * 
 * This module provides TTS functionality using OpenRouter's API gateway to access various AI models
 */

import { TTSProvider, TTSRequest, Voice, VoiceCategory } from './types';

// Default OpenRouter voices (similar to OpenAI since it's often a gateway to OpenAI models)
const DEFAULT_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openrouter', categoryId: 'openrouter-default' },
  { id: 'echo', name: 'Echo', provider: 'openrouter', categoryId: 'openrouter-default' },
  { id: 'fable', name: 'Fable', provider: 'openrouter', categoryId: 'openrouter-default' },
  { id: 'onyx', name: 'Onyx', provider: 'openrouter', categoryId: 'openrouter-default' },
  { id: 'nova', name: 'Nova', provider: 'openrouter', categoryId: 'openrouter-default' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openrouter', categoryId: 'openrouter-default' },
];

// OpenRouter voice category
const VOICE_CATEGORY: VoiceCategory = {
  id: 'openrouter-default',
  name: 'OpenRouter Voices',
  provider: 'openrouter',
};

/**
 * OpenRouter provider configuration
 */
export interface OpenRouterProviderConfig {
  apiKey: string;
  model: string;
}

/**
 * Implementation of the TTSProvider interface for OpenRouter
 */
export class OpenRouterProvider implements TTSProvider {
  private config: OpenRouterProviderConfig;
  private baseUrl: string = 'https://openrouter.ai/api/v1';

  /**
   * Create a new OpenRouter provider instance
   * 
   * @param config The OpenRouter provider configuration
   */
  constructor(config: OpenRouterProviderConfig) {
    this.config = config;
  }

  /**
   * Generate speech using OpenRouter's API
   * 
   * @param request TTS request parameters
   * @param signal AbortSignal for cancelling the request
   * @returns Promise resolving to an ArrayBuffer containing the audio data
   */
  async generateSpeech(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (!this.config.apiKey) {
      throw new Error('Missing OpenRouter API key');
    }

    try {
      console.log('Generating OpenRouter TTS with voice:', request.voice);
      
      // OpenRouter endpoint for text-to-speech (uses OpenAI-compatible endpoints)
      const endpoint = `${this.baseUrl}/audio/speech`;
      
      // Create request payload
      const payload = {
        model: this.config.model || 'openai/whisper',
        input: request.text,
        voice: request.voice,
        speed: request.speed,
        response_format: request.format === 'aac' ? 'aac' : 'mp3',
      };

      // Send request to OpenRouter
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': window.location.origin, // Required by OpenRouter
          'X-Title': 'OpenReader', // Identify our app to OpenRouter
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        // If OpenRouter doesn't support speech directly, fallback to the API proxy
        if (response.status === 404 || response.status === 501) {
          console.log('OpenRouter TTS endpoint not available, using fallback...');
          return this.fallbackToApiProxy(request, signal);
        }
        
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${errorText}`);
      }

      // Get the audio data as array buffer
      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('TTS request aborted');
        throw error;
      }
      
      console.error('Error generating TTS with OpenRouter:', error);
      throw new Error('Failed to generate audio with OpenRouter');
    }
  }
  
  /**
   * Fallback to using our server as a proxy to generate audio
   * This is used when OpenRouter doesn't support TTS directly
   * 
   * @param request The TTS request
   * @param signal AbortSignal for cancelling the request
   * @returns Promise resolving to an ArrayBuffer containing the audio data
   */
  private async fallbackToApiProxy(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
    // Send the request to our server-side proxy that can handle TTS generation
    const response = await fetch('/api/audio/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openrouter-key': this.config.apiKey,
      },
      body: JSON.stringify({
        text: request.text,
        voice: request.voice,
        speed: request.speed,
        provider: 'openrouter',
        model: this.config.model,
      }),
      signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fallback TTS error: ${errorText}`);
    }
    
    return await response.arrayBuffer();
  }

  /**
   * Get available voices from OpenRouter
   * 
   * @returns Promise resolving to an array of available voices
   */
  async getAvailableVoices(): Promise<Voice[]> {
    try {
      if (!this.config.apiKey) {
        return DEFAULT_VOICES;
      }

      // OpenRouter endpoint for voices (similar to OpenAI)
      const response = await fetch(`${this.baseUrl}/audio/voices`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'OpenReader',
          'Content-Type': 'application/json',
        },
      });

      // If OpenRouter doesn't support voice listing, return defaults
      if (!response.ok) {
        return DEFAULT_VOICES;
      }

      const data = await response.json();
      
      // Transform the API response into the Voice interface format
      if (data.voices && Array.isArray(data.voices)) {
        return data.voices.map((voiceId: string) => ({
          id: voiceId,
          name: voiceId.charAt(0).toUpperCase() + voiceId.slice(1), // Capitalize first letter
          provider: 'openrouter',
          categoryId: 'openrouter-default',
        }));
      }
      
      return DEFAULT_VOICES;
    } catch (error) {
      console.error('Error fetching OpenRouter voices:', error);
      return DEFAULT_VOICES;
    }
  }

  /**
   * Get voice categories for OpenRouter
   * 
   * @returns Promise resolving to an array of voice categories
   */
  async getVoiceCategories(): Promise<VoiceCategory[]> {
    return [VOICE_CATEGORY];
  }
}