'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { indexedDBService } from '@/utils/indexedDB';
import { useTTS } from '@/contexts/TTSContext';
import { useConfig } from '@/contexts/ConfigContext';
import { combineAudioChunks, withRetry } from '@/utils/audio';

interface HTMLContextType {
  currDocData: string | undefined;
  currDocName: string | undefined;
  currDocText: string | undefined;
  setCurrentDocument: (id: string) => Promise<void>;
  clearCurrDoc: () => void;
  createFullAudioBook: (onProgress: (progress: number) => void, signal?: AbortSignal, format?: 'mp3' | 'm4b') => Promise<ArrayBuffer>;
  isAudioCombining: boolean;
}

const HTMLContext = createContext<HTMLContextType | undefined>(undefined);

/**
 * Provider component for HTML/Markdown functionality
 * Manages the state and operations for HTML document handling
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components to be wrapped by the provider
 */
export function HTMLProvider({ children }: { children: ReactNode }) {
  const { setText: setTTSText, stop } = useTTS();
  const { apiKey, baseUrl, voiceSpeed, voice, ttsProvider } = useConfig();

  // Current document state
  const [currDocData, setCurrDocData] = useState<string>();
  const [currDocName, setCurrDocName] = useState<string>();
  const [currDocText, setCurrDocText] = useState<string>();
  const [isAudioCombining, setIsAudioCombining] = useState(false);

  /**
   * Clears all current document state and stops any active TTS
   */
  const clearCurrDoc = useCallback(() => {
    setCurrDocData(undefined);
    setCurrDocName(undefined);
    setCurrDocText(undefined);
    stop();
  }, [stop]);

  /**
   * Sets the current document based on its ID
   * @param {string} id - The unique identifier of the document
   * @throws {Error} When document data is empty or retrieval fails
   */
  const setCurrentDocument = useCallback(async (id: string): Promise<void> => {
    try {
      const doc = await indexedDBService.getHTMLDocument(id);
      if (doc) {
        setCurrDocName(doc.name);
        setCurrDocData(doc.data);
        setCurrDocText(doc.data); // Use the same text for TTS
        setTTSText(doc.data);
      } else {
        console.error('Document not found in IndexedDB');
      }
    } catch (error) {
      console.error('Failed to get HTML document:', error);
      clearCurrDoc();
    }
  }, [clearCurrDoc, setTTSText]);

  /**
   * Creates a complete audiobook from the document text
   */
  const createFullAudioBook = useCallback(async (
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    format: 'mp3' | 'm4b' = 'mp3'
  ): Promise<ArrayBuffer> => {
    try {
      if (!currDocText) {
        throw new Error('No text content found in document');
      }

      const audioChunks: { buffer: ArrayBuffer; title?: string; startTime: number }[] = [];
      const currentTime = 0;

      try {
        const audioBuffer = await withRetry(
          async () => {
            const ttsResponse = await fetch('/api/tts', {
              method: 'POST',
              headers: {
                'x-openai-key': apiKey,
                'x-openai-base-url': baseUrl,
                'x-tts-provider': ttsProvider,
              },
              body: JSON.stringify({
                text: currDocText,
                voice: voice,
                speed: voiceSpeed,
                format: format === 'm4b' ? 'aac' : 'mp3'
              }),
              signal
            });

            if (!ttsResponse.ok) {
              throw new Error(`TTS processing failed with status ${ttsResponse.status}`);
            }

            const buffer = await ttsResponse.arrayBuffer();
            if (buffer.byteLength === 0) {
              throw new Error('Received empty audio buffer from TTS');
            }
            return buffer;
          },
          {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 2
          }
        );

        audioChunks.push({
          buffer: audioBuffer,
          title: currDocName,
          startTime: currentTime
        });

        onProgress(100); // Single chunk, so we're done when it completes
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('TTS request aborted');
          const partialBuffer = await combineAudioChunks(audioChunks, format, setIsAudioCombining);
          return partialBuffer;
        }
        throw error;
      }

      return combineAudioChunks(audioChunks, format, setIsAudioCombining);
    } catch (error) {
      console.error('Error creating audiobook:', error);
      throw error;
    }
  }, [currDocText, currDocName, apiKey, baseUrl, voice, voiceSpeed, ttsProvider]);

  const contextValue = useMemo(() => ({
    currDocData,
    currDocName,
    currDocText,
    setCurrentDocument,
    clearCurrDoc,
    createFullAudioBook,
    isAudioCombining,
  }), [
    currDocData,
    currDocName,
    currDocText,
    setCurrentDocument,
    clearCurrDoc,
    createFullAudioBook,
    isAudioCombining,
  ]);

  return (
    <HTMLContext.Provider value={contextValue}>
      {children}
    </HTMLContext.Provider>
  );
}

/**
 * Custom hook to consume the HTML context
 * @returns {HTMLContextType} The HTML context value
 * @throws {Error} When used outside of HTMLProvider
 */
export function useHTML() {
  const context = useContext(HTMLContext);
  if (context === undefined) {
    throw new Error('useHTML must be used within an HTMLProvider');
  }
  return context;
}
