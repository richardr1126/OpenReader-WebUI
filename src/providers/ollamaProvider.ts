/**
 * Ollama Provider Implementation
 * 
 * This module provides TTS functionality using Ollama's API for local AI models
 */

import { TTSProvider, TTSRequest, Voice, VoiceCategory } from './types';

// Default Ollama voices
const DEFAULT_VOICES: Voice[] = [
  { id: 'default', name: 'Default', provider: 'ollama', categoryId: 'ollama-default' },
];

// Ollama voice category
const VOICE_CATEGORY: VoiceCategory = {
  id: 'ollama-default',
  name: 'Ollama Voices',
  provider: 'ollama',
};

/**
 * Ollama provider configuration
 */
export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

/**
 * Implementation of the TTSProvider interface for Ollama
 */
export class OllamaProvider implements TTSProvider {
  private config: OllamaProviderConfig;

  /**
   * Create a new Ollama provider instance
   * 
   * @param config The Ollama provider configuration
   */
  constructor(config: OllamaProviderConfig) {
    this.config = config;
  }

  /**
   * Generate speech using Ollama's API
   * 
   * @param request TTS request parameters
   * @param signal AbortSignal for cancelling the request
   * @returns Promise resolving to an ArrayBuffer containing the audio data
   */
  async generateSpeech(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
    try {
      console.log('Generating Ollama TTS with voice:', request.voice);
      
      // Ollama endpoint for text-to-speech
      const endpoint = `${this.config.baseUrl}/api/generate`;
      
      // Create request payload
      const payload = {
        model: this.config.model,
        prompt: request.text,
        stream: false,
        options: {
          temperature: 0.7,
          audio: true
        }
      };

      // Send request to Ollama
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${errorText}`);
      }

      // Get the response data
      const data = await response.json();
      
      // For Ollama, we might need to convert the response to audio
      // This depends on how Ollama returns audio data
      // For now, let's use a fallback approach where we send the generated text to the server
      // to convert it to audio
      
      // Send text to audio conversion API
      const audioResponse = await fetch('/api/audio/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: data.response || request.text,
          voice: request.voice || 'default',
          speed: request.speed || 1.0,
        }),
        signal,
      });
      
      if (!audioResponse.ok) {
        const errorText = await audioResponse.text();
        throw new Error(`Audio conversion error: ${errorText}`);
      }
      
      // Return the converted audio
      return await audioResponse.arrayBuffer();
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('TTS request aborted');
        throw error;
      }
      
      console.error('Error generating TTS with Ollama:', error);
      throw new Error('Failed to generate audio with Ollama');
    }
  }

  /**
   * Get available voices from Ollama
   * 
   * @returns Promise resolving to an array of available voices
   */
  async getAvailableVoices(): Promise<Voice[]> {
    try {
      // For Ollama, we typically just have a default voice since it's using local models
      return DEFAULT_VOICES;
      
    } catch (error) {
      console.error('Error fetching Ollama voices:', error);
      return DEFAULT_VOICES;
    }
  }

  /**
   * Get voice categories for Ollama
   * 
   * @returns Promise resolving to an array of voice categories
   */
  async getVoiceCategories(): Promise<VoiceCategory[]> {
    return [VOICE_CATEGORY];
  }
}