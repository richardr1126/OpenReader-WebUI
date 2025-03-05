'use client';

import { useState, useCallback, useEffect } from 'react';
import { Voice, VoiceCategory, ProviderType, VoiceProviderType, ProviderSettings } from '@/providers/types';

// Simple memory cache for voice data to prevent unnecessary fetches
let voiceCache: Record<string, {
  voices: Voice[],
  categories: VoiceCategory[],
  timestamp: number
}> = {};

// Default voices for fallback
const DEFAULT_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openai', categoryId: 'openai-default' },
  { id: 'echo', name: 'Echo', provider: 'openai', categoryId: 'openai-default' },
  { id: 'fable', name: 'Fable', provider: 'openai', categoryId: 'openai-default' },
  { id: 'onyx', name: 'Onyx', provider: 'openai', categoryId: 'openai-default' },
  { id: 'nova', name: 'Nova', provider: 'openai', categoryId: 'openai-default' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai', categoryId: 'openai-default' },
];

// Default categories for fallback
const DEFAULT_CATEGORIES: VoiceCategory[] = [
  { id: 'openai-default', name: 'OpenAI Voices', provider: 'openai' }
];

// Cache lifetime in milliseconds (5 minutes)
const CACHE_LIFETIME = 5 * 60 * 1000;

/**
 * Custom hook for managing TTS voices
 * @param provider The selected provider type
 * @param voiceProvider The selected voice provider type
 * @param providerSettings Provider configuration settings
 * @returns Object containing available voices and fetch function
 */
export function useVoiceManagement(
  provider: ProviderType,
  voiceProvider: VoiceProviderType,
  providerSettings: ProviderSettings,
  documentId?: string
) {
  const [availableVoices, setAvailableVoices] = useState<Voice[]>(DEFAULT_VOICES);
  const [voiceCategories, setVoiceCategories] = useState<VoiceCategory[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate cache key based on provider configuration
  const getCacheKey = useCallback(() => {
    return `${provider}-${voiceProvider}-${JSON.stringify(providerSettings)}`;
  }, [provider, voiceProvider, providerSettings]);

  /**
   * Fetches available voices from the selected provider
   */
  const fetchVoices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const cacheKey = getCacheKey();
      
      // Check for cached data first
      const cachedData = voiceCache[cacheKey];
      if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_LIFETIME) {
        console.log('Using cached voice data');
        setAvailableVoices(cachedData.voices);
        setVoiceCategories(cachedData.categories);
        setIsLoading(false);
        return;
      }
      
      console.log(`Fetching voices from ${provider}/${voiceProvider}...`);
      
      const response = await fetch('/api/tts/voices', {
        headers: {
          'x-provider': provider,
          'x-voice-provider': voiceProvider,
          'x-provider-settings': JSON.stringify(providerSettings),
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache the voice data
      voiceCache[cacheKey] = {
        voices: data.voices?.length ? data.voices : DEFAULT_VOICES,
        categories: data.categories?.length ? data.categories : DEFAULT_CATEGORIES,
        timestamp: Date.now()
      };
      
      setAvailableVoices(data.voices?.length ? data.voices : DEFAULT_VOICES);
      setVoiceCategories(data.categories?.length ? data.categories : DEFAULT_CATEGORIES);
    } catch (error) {
      console.error('Error fetching voices:', error);
      setError(error instanceof Error ? error.message : 'Unknown error fetching voices');
      setAvailableVoices(DEFAULT_VOICES);
      setVoiceCategories(DEFAULT_CATEGORIES);
    } finally {
      setIsLoading(false);
    }
  }, [provider, voiceProvider, providerSettings, getCacheKey]);

  // Fetch voices when provider settings change
  useEffect(() => {
    fetchVoices();
  }, [provider, voiceProvider, fetchVoices]);

  /**
   * Clears the voice cache
   */
  const clearCache = useCallback(() => {
    voiceCache = {};
    fetchVoices();
  }, [fetchVoices]);

  /**
   * Gets a voice by ID
   */
  const getVoiceById = useCallback((voiceId: string) => {
    return availableVoices.find((voice: Voice) => voice.id === voiceId);
  }, [availableVoices]);

  /**
   * Gets voices for a specific category
   */
  const getVoicesByCategory = useCallback((categoryId: string) => {
    return availableVoices.filter((voice: Voice) => voice.categoryId === categoryId);
  }, [availableVoices]);

  /**
   * Get a list of voice IDs only (for backward compatibility with existing code)
   */
  const voiceIds = availableVoices.map((voice: Voice) => voice.id);

  return { 
    availableVoices, 
    voiceCategories, 
    voiceIds,
    isLoading, 
    error, 
    fetchVoices, 
    clearCache,
    getVoiceById,
    getVoicesByCategory
  };
}
