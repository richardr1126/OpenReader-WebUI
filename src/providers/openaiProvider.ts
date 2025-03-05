/**
 * OpenAI Provider Implementation
 * 
 * This module provides TTS functionality using OpenAI's API
 */

import { TTSProvider, TTSRequest, Voice, VoiceCategory } from './types';

// Default OpenAI voices
const DEFAULT_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openai', categoryId: 'openai-default' },
  { id: 'echo', name: 'Echo', provider: 'openai', categoryId: 'openai-default' },
  { id: 'fable', name: 'Fable', provider: 'openai', categoryId: 'openai-default' },
  { id: 'onyx', name: 'Onyx', provider: 'openai', categoryId: 'openai-default' },
  { id: 'nova', name: 'Nova', provider: 'openai', categoryId: 'openai-default' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai', categoryId: 'openai-default' },
];

// OpenAI voice category
const VOICE_CATEGORY: VoiceCategory = {
  id: 'openai-default',
  name: 'OpenAI Voices',
  provider: 'openai',
};

/**
 * OpenAI provider configuration
 */
export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Implementation of the TTSProvider interface for OpenAI
 */
export class OpenAIProvider implements TTSProvider {
  private config: OpenAIProviderConfig;

  /**
   * Create a new OpenAI provider instance
   * 
   * @param config The OpenAI provider configuration
   */
  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  /**
   * Generate speech using OpenAI's API
   * 
   * @param request TTS request parameters
   * @param signal AbortSignal for cancelling the request
   * @returns Promise resolving to an ArrayBuffer containing the audio data
   */
  async generateSpeech(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (!this.config.apiKey) {
      throw new Error('Missing OpenAI API key');
    }

    try {
      console.log('Generating OpenAI TTS with voice:', request.voice);
      
      // OpenAI endpoint for text-to-speech
      const endpoint = `${this.config.baseUrl}/audio/speech`;
      
      // Create request payload
      const payload = {
        model: this.config.model,
        input: request.text,
        voice: request.voice,
        speed: request.speed,
        response_format: request.format === 'aac' ? 'aac' : 'mp3',
      };

      // Send request to OpenAI
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${errorText}`);
      }

      // Get the audio data as array buffer
      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('TTS request aborted by client');
        throw error;
      }
      
      console.error('Error generating TTS with OpenAI:', error);
      throw new Error('Failed to generate audio with OpenAI');
    }
  }

  /**
   * Get available voices from OpenAI
   * 
   * @returns Promise resolving to an array of available voices
   */
  async getAvailableVoices(): Promise<Voice[]> {
    try {
      if (!this.config.apiKey) {
        return DEFAULT_VOICES;
      }

      // OpenAI endpoint for voices
      const response = await fetch(`${this.config.baseUrl}/audio/voices`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return DEFAULT_VOICES;
      }

      const data = await response.json();
      
      // Transform the API response into the Voice interface format
      if (data.voices && Array.isArray(data.voices)) {
        return data.voices.map((voiceId: string) => ({
          id: voiceId,
          name: voiceId.charAt(0).toUpperCase() + voiceId.slice(1), // Capitalize first letter
          provider: 'openai',
          categoryId: 'openai-default',
        }));
      }
      
      return DEFAULT_VOICES;
    } catch (error) {
      console.error('Error fetching OpenAI voices:', error);
      return DEFAULT_VOICES;
    }
  }

  /**
   * Get voice categories for OpenAI
   * 
   * @returns Promise resolving to an array of voice categories
   */
  async getVoiceCategories(): Promise<VoiceCategory[]> {
    return [VOICE_CATEGORY];
  }
}