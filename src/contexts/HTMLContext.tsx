'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { getHtmlDocument, getLastChapterIndex, setLastDocumentLocation } from '@/lib/dexie';
import { useTTS } from '@/contexts/TTSContext';
import { detectChapters, type Chapter } from '@/lib/chapterDetection';
import type { TTSAudiobookChapter } from '@/types/tts';

interface HTMLContextType {
  currDocData: string | undefined;
  currDocName: string | undefined;
  currDocText: string | undefined;
  setCurrentDocument: (id: string) => Promise<void>;
  clearCurrDoc: () => void;

  // Chapter navigation
  chapters: Chapter[];
  currentChapterIndex: number;
  totalChapters: number;
  goToNextChapter: () => void;
  goToPreviousChapter: () => void;
  goToChapter: (index: number) => void;

  // Audiobook generation
  createFullAudioBook: (
    onProgress: (progress: number) => void,
    signal: AbortSignal,
    onChapterComplete: (chapter: TTSAudiobookChapter) => void,
    documentId: string,
    format: 'mp3' | 'm4b'
  ) => Promise<string>;
  regenerateChapter: (
    chapterIndex: number,
    bookId: string,
    format: 'mp3' | 'm4b',
    signal: AbortSignal
  ) => Promise<TTSAudiobookChapter>;
}

const HTMLContext = createContext<HTMLContextType | undefined>(undefined);

/**
 * Provider component for HTML/Markdown functionality
 * Manages the state and operations for HTML document handling
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components to be wrapped by the provider
 */
export function HTMLProvider({ children }: { children: ReactNode }) {
  const { setText: setTTSText, stop, registerLocationChangeHandler } = useTTS();

  // Current document state
  const [currDocData, setCurrDocData] = useState<string>();
  const [currDocName, setCurrDocName] = useState<string>();
  const [currDocText, setCurrDocText] = useState<string>();
  const [currDocId, setCurrDocId] = useState<string>();

  // Chapter state
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);

  /**
   * Clears all current document state and stops any active TTS
   */
  const clearCurrDoc = useCallback(() => {
    setCurrDocData(undefined);
    setCurrDocName(undefined);
    setCurrDocText(undefined);
    setCurrDocId(undefined);
    setChapters([]);
    setCurrentChapterIndex(0);
    stop();
  }, [stop]);

  /**
   * Sets the current document based on its ID
   * Automatically detects chapters and displays only the first chapter
   * @param {string} id - The unique identifier of the document
   * @throws {Error} When document data is empty or retrieval fails
   */
  const setCurrentDocument = useCallback(async (id: string): Promise<void> => {
    try {
      const doc = await getHtmlDocument(id);
      if (doc) {
        setCurrDocId(id);
        setCurrDocName(doc.name);

        // Detect chapters in the document (splits large files)
        const detectedChapters = detectChapters(doc.data, 50000); // 50KB max per chapter

        if (detectedChapters.length > 1) {
          // Document has been split into chapters
          console.log(`Document split into ${detectedChapters.length} chapters`);
          setChapters(detectedChapters);

          // Restore last chapter position or start from beginning
          const lastChapterIndex = await getLastChapterIndex(id);
          const startChapterIndex = lastChapterIndex !== null && lastChapterIndex < detectedChapters.length ? lastChapterIndex : 0;
          setCurrentChapterIndex(startChapterIndex);

          // Display the restored or first chapter
          const startChapter = detectedChapters[startChapterIndex];
          setCurrDocData(startChapter.text);
          setCurrDocText(startChapter.text);
          setTTSText(startChapter.text);

          console.log(`Restored to chapter ${startChapterIndex + 1} of ${detectedChapters.length}`);
        } else {
          // Small document, no chapters needed
          setChapters([]);
          setCurrentChapterIndex(0);
          setCurrDocData(doc.data);
          setCurrDocText(doc.data);
          setTTSText(doc.data);
        }
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
    _signal: AbortSignal,
    _onChapterComplete: (chapter: TTSAudiobookChapter) => void,
    documentId: string,
    _format: 'mp3' | 'm4b'
  ) => {
    // Placeholder - will be implemented with job queue system
    console.log('createFullAudioBook called for HTML document:', documentId);
    onProgress(0);

    // TODO: Integrate with background job queue
    // For now, return a placeholder
    return 'placeholder';
  }, []);

  /**
   * Regenerates a specific chapter
   * Placeholder implementation
   */
  const regenerateChapter = useCallback(async (
    chapterIndex: number,
    bookId: string,
    format: 'mp3' | 'm4b',
    _signal: AbortSignal
  ): Promise<TTSAudiobookChapter> => {
    // Placeholder
    console.log('regenerateChapter called:', chapterIndex, bookId, format);
    return {
      index: chapterIndex,
      title: `Chapter ${chapterIndex + 1}`,
      status: 'completed',
      bookId,
      format,
    };
  }, []);

  /**
   * Navigate to a specific chapter
   */
  const goToChapter = useCallback((index: number) => {
    if (chapters.length === 0) return;

    const safeIndex = Math.max(0, Math.min(index, chapters.length - 1));
    setCurrentChapterIndex(safeIndex);

    const chapter = chapters[safeIndex];
    setCurrDocData(chapter.text);
    setCurrDocText(chapter.text);
    setTTSText(chapter.text, true); // Pause TTS when changing chapters
  }, [chapters, setTTSText]);

  /**
   * Navigate to the next chapter
   */
  const goToNextChapter = useCallback(() => {
    if (currentChapterIndex < chapters.length - 1) {
      goToChapter(currentChapterIndex + 1);
    }
  }, [currentChapterIndex, chapters.length, goToChapter]);

  /**
   * Navigate to the previous chapter
   */
  const goToPreviousChapter = useCallback(() => {
    if (currentChapterIndex > 0) {
      goToChapter(currentChapterIndex - 1);
    }
  }, [currentChapterIndex, goToChapter]);

  /**
   * Register handler for TTS auto-advance through chapters
   * When TTS reaches the end of current chapter, automatically load next chapter
   */
  const handleLocationChange = useCallback((location: string | number) => {
    if (location === 'next') {
      // TTS wants to advance to next chapter
      if (currentChapterIndex < chapters.length - 1) {
        const nextIndex = currentChapterIndex + 1;
        setCurrentChapterIndex(nextIndex);

        const nextChapter = chapters[nextIndex];
        setCurrDocData(nextChapter.text);
        setCurrDocText(nextChapter.text);
        setTTSText(nextChapter.text); // Continue playing
      }
    } else if (location === 'prev') {
      // TTS wants to go to previous chapter
      if (currentChapterIndex > 0) {
        const prevIndex = currentChapterIndex - 1;
        setCurrentChapterIndex(prevIndex);

        const prevChapter = chapters[prevIndex];
        setCurrDocData(prevChapter.text);
        setCurrDocText(prevChapter.text);
        setTTSText(prevChapter.text);
      }
    }
  }, [currentChapterIndex, chapters, setTTSText]);

  // Register the handler with TTS context when chapters exist
  useMemo(() => {
    if (chapters.length > 1) {
      registerLocationChangeHandler(handleLocationChange);
    }
  }, [chapters.length, registerLocationChangeHandler, handleLocationChange]);

  // Save chapter position whenever it changes
  useEffect(() => {
    if (currDocId && chapters.length > 1) {
      // Save current chapter index to remember position
      setLastDocumentLocation(currDocId, String(currentChapterIndex), currentChapterIndex)
        .catch(error => console.error('Failed to save chapter position:', error));
    }
  }, [currDocId, currentChapterIndex, chapters.length]);

  const totalChapters = chapters.length;

  const contextValue = useMemo(() => ({
    currDocData,
    currDocName,
    currDocText,
    setCurrentDocument,
    clearCurrDoc,
    chapters,
    currentChapterIndex,
    totalChapters,
    goToNextChapter,
    goToPreviousChapter,
    goToChapter,
    createFullAudioBook,
    regenerateChapter,
  }), [
    currDocData,
    currDocName,
    currDocText,
    setCurrentDocument,
    clearCurrDoc,
    chapters,
    currentChapterIndex,
    totalChapters,
    goToNextChapter,
    goToPreviousChapter,
    goToChapter,
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
