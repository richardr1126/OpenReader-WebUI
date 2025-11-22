'use client';

import { useRef } from 'react';
import { LRUCache } from 'lru-cache';
import type { TTSAudioBuffer } from '@/types/tts';

/**
 * Custom hook for managing audio cache using LRU strategy
 * @param maxSize Maximum number of items to store in cache
 * @returns Object containing cache methods
 */
export function useAudioCache(maxSize = 50) {
  const cacheRef = useRef(new LRUCache<string, TTSAudioBuffer>({ max: maxSize }));

  return {
    get: (key: string) => cacheRef.current.get(key),
    set: (key: string, value: TTSAudioBuffer) => cacheRef.current.set(key, value),
    delete: (key: string) => cacheRef.current.delete(key),
    has: (key: string) => cacheRef.current.has(key),
    clear: () => cacheRef.current.clear(),
  };
}
