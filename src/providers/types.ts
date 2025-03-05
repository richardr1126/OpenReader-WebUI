/**
 * Provider types and interfaces for OpenReader text-to-speech functionality
 */

/**
 * Available AI Providers
 * 
 * - openai: OpenAI's text-to-speech
 * - ollama: Local model via Ollama
 * - openrouter: API gateway to various models
 */
export type ProviderType = 'openai' | 'ollama' | 'openrouter';

/**
 * Available Voice Providers
 * 
 * - openai: Default OpenAI voices
 * - elevenlabs: Premium voice synthesis
 */
export type VoiceProviderType = 'openai' | 'elevenlabs';

/**
 * Text-to-speech request parameters
 */
export interface TTSRequest {
  text: string;
  voice: string;
  speed?: number;
  format?: 'mp3' | 'aac';
}

/**
 * Voice representation for the UI
 */
export interface Voice {
  id: string;
  name: string;
  provider: string;
  categoryId: string;
  description?: string;
  previewUrl?: string;
}

/**
 * Voice category for grouping voices in the UI
 */
export interface VoiceCategory {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

/**
 * Provider interface for text-to-speech functionality
 */
export interface TTSProvider {
  /**
   * Generate speech from text
   * 
   * @param request TTS parameters
   * @param signal AbortSignal for cancelling the request
   * @returns Promise with audio data as ArrayBuffer
   */
  generateSpeech(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer>;
  
  /**
   * Get available voices from the provider
   * 
   * @returns Promise with array of available voices
   */
  getAvailableVoices(): Promise<Voice[]>;
  
  /**
   * Get voice categories from the provider
   * 
   * @returns Promise with array of voice categories
   */
  getVoiceCategories(): Promise<VoiceCategory[]>;
}

/**
 * Provider settings for all available providers
 */
export interface ProviderSettings {
  openai: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
  };
  elevenlabs: {
    apiKey: string;
  };
}

/**
 * Provider options for creating a provider instance
 */
export interface ProviderOptions {
  providerSettings: ProviderSettings;
  provider?: ProviderType; // Added to support specifying provider for voice generation
}

/**
 * Document-specific provider override settings
 */
export interface DocumentProviderOverride {
  provider?: ProviderType;
  voiceProvider?: VoiceProviderType;
  voice?: string;
}