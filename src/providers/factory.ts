/**
 * Provider Factory
 * 
 * This module provides factory functions to create the appropriate TTS provider
 * based on the current configuration and settings.
 */

import { ProviderType, TTSProvider, VoiceProviderType, ProviderOptions, VoiceCategory, Voice } from './types';
import { OpenAIProvider } from './openaiProvider';
import { OllamaProvider } from './ollamaProvider';
import { OpenRouterProvider } from './openrouterProvider';
import { ElevenLabsProvider } from './elevenlabsProvider';

/**
 * Creates the appropriate AI provider based on the requested provider type
 * 
 * @param provider The provider type to create
 * @param options Provider configuration options
 * @returns An instance of the requested provider
 */
export function createProvider(provider: ProviderType, options: ProviderOptions): TTSProvider {
  const { providerSettings } = options;

  switch (provider) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: providerSettings.openai.apiKey,
        baseUrl: providerSettings.openai.baseUrl,
        model: providerSettings.openai.model,
      });
    
    case 'ollama':
      return new OllamaProvider({
        baseUrl: providerSettings.ollama.baseUrl,
        model: providerSettings.ollama.model,
      });
    
    case 'openrouter':
      return new OpenRouterProvider({
        apiKey: providerSettings.openrouter.apiKey,
        model: providerSettings.openrouter.model,
      });
    
    default:
      console.warn(`Unknown provider type: ${provider}, defaulting to OpenAI`);
      return new OpenAIProvider({
        apiKey: providerSettings.openai.apiKey,
        baseUrl: providerSettings.openai.baseUrl,
        model: providerSettings.openai.model,
      });
  }
}

/**
 * Creates a voice provider for TTS based on the requested voice provider type
 * 
 * @param voiceProvider The voice provider type to create
 * @param options Provider configuration options
 * @returns An instance of the requested voice provider
 */
export function createVoiceProvider(voiceProvider: VoiceProviderType, options: ProviderOptions): TTSProvider {
  const { providerSettings } = options;

  switch (voiceProvider) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: providerSettings.openai.apiKey,
        baseUrl: providerSettings.openai.baseUrl,
        model: providerSettings.openai.model,
      });
    
    case 'elevenlabs':
      return new ElevenLabsProvider({
        apiKey: providerSettings.elevenlabs.apiKey,
      });
    
    default:
      console.warn(`Unknown voice provider type: ${voiceProvider}, defaulting to OpenAI`);
      return new OpenAIProvider({
        apiKey: providerSettings.openai.apiKey,
        baseUrl: providerSettings.openai.baseUrl,
        model: providerSettings.openai.model,
      });
  }
}

/**
 * Creates a provider based on document override settings
 * 
 * @param defaultProvider The default provider to use
 * @param defaultVoiceProvider The default voice provider to use
 * @param documentOverride Document-specific override settings
 * @param options Provider configuration options
 * @returns An instance of the appropriate provider
 */
export function createProviderWithOverrides(
  defaultProvider: ProviderType,
  defaultVoiceProvider: VoiceProviderType,
  documentOverride: { provider?: ProviderType; voiceProvider?: VoiceProviderType; voice?: string } | undefined,
  options: ProviderOptions
): { provider: TTSProvider; voiceProvider: TTSProvider; voice?: string } {
  const provider = documentOverride?.provider || defaultProvider;
  const voiceProvider = documentOverride?.voiceProvider || defaultVoiceProvider;
  const voice = documentOverride?.voice;

  return {
    provider: createProvider(provider, options),
    voiceProvider: createVoiceProvider(voiceProvider, options),
    voice,
  };
}

/**
 * Combines voices from multiple providers into a single array
 * 
 * @param voices Arrays of voices from different providers
 * @returns Combined array of unique voices
 */
export function combineVoicesFromProviders(...voices: Voice[][]): Voice[] {
  const voiceMap = new Map<string, Voice>();
  
  // Add each voice to the map, using id+provider as the key to ensure uniqueness
  for (const voiceArray of voices) {
    for (const voice of voiceArray) {
      const key = `${voice.provider}-${voice.id}`;
      voiceMap.set(key, voice);
    }
  }
  
  // Convert the map back to an array
  return Array.from(voiceMap.values());
}

/**
 * Combines voice categories from multiple providers into a single array
 * 
 * @param categories Arrays of voice categories from different providers
 * @returns Combined array of unique voice categories
 */
export function combineCategories(...categories: VoiceCategory[][]): VoiceCategory[] {
  const categoryMap = new Map<string, VoiceCategory>();
  
  // Add each category to the map, using id as the key to ensure uniqueness
  for (const categoryArray of categories) {
    for (const category of categoryArray) {
      categoryMap.set(category.id, category);
    }
  }
  
  // Convert the map back to an array
  return Array.from(categoryMap.values());
}