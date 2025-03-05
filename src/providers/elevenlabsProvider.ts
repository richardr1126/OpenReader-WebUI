/**
 * ElevenLabs Provider Implementation
 * 
 * This module provides premium voice synthesis functionality using ElevenLabs API
 */

import { TTSProvider, TTSRequest, Voice, VoiceCategory } from './types';

// Default ElevenLabs voices (will be overridden by API response)
const DEFAULT_VOICES: Voice[] = [
  { id: 'Bella', name: 'Bella', provider: 'elevenlabs', categoryId: 'elevenlabs-premium' },
  { id: 'Antoni', name: 'Antoni', provider: 'elevenlabs', categoryId: 'elevenlabs-premium' },
  { id: 'Rachel', name: 'Rachel', provider: 'elevenlabs', categoryId: 'elevenlabs-premium' },
  { id: 'Domi', name: 'Domi', provider: 'elevenlabs', categoryId: 'elevenlabs-premium' },
  { id: 'Charlie', name: 'Charlie', provider: 'elevenlabs', categoryId: 'elevenlabs-premium' },
];

// ElevenLabs voice categories
const DEFAULT_CATEGORIES: VoiceCategory[] = [
  {
    id: 'elevenlabs-premium',
    name: 'Premium Voices',
    provider: 'elevenlabs',
  },
  {
    id: 'elevenlabs-custom',
    name: 'Your Custom Voices',
    provider: 'elevenlabs',
  }
];

/**
 * ElevenLabs provider configuration
 */
export interface ElevenLabsProviderConfig {
  apiKey: string;
}

/**
 * ElevenLabs voice interface from their API
 */
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

/**
 * Implementation of the TTSProvider interface for ElevenLabs
 */
export class ElevenLabsProvider implements TTSProvider {
  private config: ElevenLabsProviderConfig;
  private baseUrl: string = 'https://api.elevenlabs.io/v1';

  /**
   * Create a new ElevenLabs provider instance
   * 
   * @param config The ElevenLabs provider configuration
   */
  constructor(config: ElevenLabsProviderConfig) {
    this.config = config;
  }

  /**
   * Generate speech using ElevenLabs API
   * 
   * @param request TTS request parameters
   * @param signal AbortSignal for cancelling the request
   * @returns Promise resolving to an ArrayBuffer containing the audio data
   */
  async generateSpeech(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (!this.config.apiKey) {
      throw new Error('Missing ElevenLabs API key');
    }

    try {
      console.log('Generating ElevenLabs TTS with voice:', request.voice);
      
      // ElevenLabs endpoint for text-to-speech
      const endpoint = `${this.baseUrl}/text-to-speech/${request.voice}`;
      
      // Calculate stability and similarity settings
      // In ElevenLabs, these are between 0 and 1
      const stability = 0.5; // Medium stability
      const similarity = 0.75; // Higher similarity to the original voice
      
      // Create request payload with the voice settings object
      const payload = {
        text: request.text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability,
          similarity_boost: similarity,
          // Convert speed from OpenAI range to ElevenLabs range
          // OpenAI typically uses 0.25-4.0, ElevenLabs uses 0.5-2.0
          // We'll map the ranges approximately
          speaking_rate: Math.max(0.5, Math.min(2.0, request.speed)),
        }
      };

      // Send request to ElevenLabs
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${errorText}`);
      }

      // Get the audio data as array buffer
      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('TTS request aborted');
        throw error;
      }
      
      console.error('Error generating TTS with ElevenLabs:', error);
      throw new Error('Failed to generate audio with ElevenLabs');
    }
  }

  /**
   * Get available voices from ElevenLabs
   * Fetches both premium and user's custom voices
   * 
   * @returns Promise resolving to an array of available voices
   */
  async getAvailableVoices(): Promise<Voice[]> {
    try {
      if (!this.config.apiKey) {
        return DEFAULT_VOICES;
      }

      // ElevenLabs endpoint for voices
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch ElevenLabs voices, using defaults');
        return DEFAULT_VOICES;
      }

      const data = await response.json();
      
      // Transform the API response into the Voice interface format
      if (data.voices && Array.isArray(data.voices)) {
        return data.voices.map((voice: ElevenLabsVoice) => {
          // Determine category based on voice properties
          // Cloned voices are typically user's custom voices
          const categoryId = voice.category === 'cloned' 
            ? 'elevenlabs-custom' 
            : 'elevenlabs-premium';
          
          return {
            id: voice.voice_id,
            name: voice.name,
            provider: 'elevenlabs',
            categoryId,
            description: voice.description,
            previewUrl: voice.preview_url,
          };
        });
      }
      
      return DEFAULT_VOICES;
    } catch (error) {
      console.error('Error fetching ElevenLabs voices:', error);
      return DEFAULT_VOICES;
    }
  }

  /**
   * Get voice categories for ElevenLabs
   * 
   * @returns Promise resolving to an array of voice categories
   */
  async getVoiceCategories(): Promise<VoiceCategory[]> {
    // For ElevenLabs, we typically have premium voices and user's custom voices
    try {
      if (!this.config.apiKey) {
        return DEFAULT_CATEGORIES;
      }
      
      // Fetch user information to check subscription
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        return DEFAULT_CATEGORIES;
      }
      
      const userData = await response.json();
      
      // Customize categories based on subscription information if needed
      const categories = [...DEFAULT_CATEGORIES];
      
      // If subscription tier is available, you could add a tier-specific category
      if (userData.subscription && userData.subscription.tier) {
        const tier = userData.subscription.tier;
        if (tier === 'creator') {
          categories.push({
            id: 'elevenlabs-creator',
            name: 'Creator Voices',
            provider: 'elevenlabs',
          });
        }
      }
      
      return categories;
    } catch (error) {
      console.error('Error fetching ElevenLabs categories:', error);
      return DEFAULT_CATEGORIES;
    }
  }
}