'use client';

import { useState, useCallback } from 'react';

const DEFAULT_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];

/**
 * Custom hook for managing TTS voices
 * @param apiKey OpenAI API key
 * @param baseUrl OpenAI API base URL
 * @returns Object containing available voices and fetch function
 */
export function useVoiceManagement(apiKey: string | undefined, baseUrl: string | undefined) {
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [voiceApiFailed, setVoiceApiFailed] = useState(false);

  const fetchVoices = useCallback(async () => {
    try {
      console.log('Fetching voices...');
      const response = await fetch('/api/tts/voices', {
        headers: {
          'x-openai-key': apiKey || '',
          'x-openai-base-url': baseUrl || '',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch voices');
      const data = await response.json();
      setAvailableVoices(data.voices || DEFAULT_VOICES);
      setVoiceApiFailed(data.failed || false);
    } catch (error) {
      console.error('Error fetching voices:', error);
      // Set available voices to default openai voices
      setAvailableVoices(DEFAULT_VOICES);
      setVoiceApiFailed(true);
    }
  }, [apiKey, baseUrl]);

  return { availableVoices, fetchVoices, voiceApiFailed };
}
