'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { getHtmlDocument } from '@/lib/dexie';
import { useTTS } from '@/contexts/TTSContext';

interface HTMLContextType {
  currDocData: string | undefined;
  currDocName: string | undefined;
  currDocText: string | undefined;
  setCurrentDocument: (id: string) => Promise<void>;
  clearCurrDoc: () => void;
  createFullAudioBook: (
    onProgress: (progress: number) => void,
    signal: AbortSignal,
    onChapterComplete: (chapter: any) => void,
    documentId: string,
    format: 'mp3' | 'm4b'
  ) => Promise<{ bookId: string; format: string }>;
  regenerateChapter: (
    chapterIndex: number,
    bookId: string,
    format: 'mp3' | 'm4b',
    signal: AbortSignal
  ) => Promise<void>;
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

  // Current document state
  const [currDocData, setCurrDocData] = useState<string>();
  const [currDocName, setCurrDocName] = useState<string>();
  const [currDocText, setCurrDocText] = useState<string>();


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
      const doc = await getHtmlDocument(id);
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
   * Creates a full audiobook from the HTML/text document
   * This is a placeholder implementation that treats the entire document as one chapter
   */
  const createFullAudioBook = useCallback(async (
    onProgress: (progress: number) => void,
    signal: AbortSignal,
    onChapterComplete: (chapter: any) => void,
    documentId: string,
    format: 'mp3' | 'm4b'
  ) => {
    // Placeholder - will be implemented with job queue system
    console.log('createFullAudioBook called for HTML document:', documentId);
    onProgress(0);

    // TODO: Integrate with background job queue
    // For now, return a placeholder
    return { bookId: 'placeholder', format };
  }, []);

  /**
   * Regenerates a specific chapter
   * Placeholder implementation
   */
  const regenerateChapter = useCallback(async (
    chapterIndex: number,
    bookId: string,
    format: 'mp3' | 'm4b',
    signal: AbortSignal
  ) => {
    // Placeholder
    console.log('regenerateChapter called:', chapterIndex, bookId, format);
  }, []);

  const contextValue = useMemo(() => ({
    currDocData,
    currDocName,
    currDocText,
    setCurrentDocument,
    clearCurrDoc,
    createFullAudioBook,
    regenerateChapter,
  }), [
    currDocData,
    currDocName,
    currDocText,
    setCurrentDocument,
    clearCurrDoc,
    createFullAudioBook,
    regenerateChapter,
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
