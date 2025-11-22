/**
 * PDF Context Provider
 * 
 * This module provides a React context for managing PDF document functionality.
 * It handles document loading, text extraction, highlighting, and integration with TTS.
 * 
 * Key features:
 * - PDF document management (add/remove/load)
 * - Text extraction and processing
 * - Text highlighting and navigation
 * - Document state management
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  RefObject,
  useRef,
} from 'react';

import type { PDFDocumentProxy } from 'pdfjs-dist';

import { getPdfDocument } from '@/lib/dexie';
import { useTTS } from '@/contexts/TTSContext';
import { useConfig } from '@/contexts/ConfigContext';
import { processTextToSentences } from '@/lib/nlp';
import { withRetry } from '@/utils/audio';
import {
  extractTextFromPDF,
  highlightPattern,
  clearHighlights,
  clearWordHighlights,
  highlightWordIndex,
} from '@/lib/pdf';

import type {
  TTSRequestHeaders,
  TTSRequestPayload,
  TTSRetryOptions,
  TTSSentenceAlignment
} from '@/types/tts';

/**
 * Interface defining all available methods and properties in the PDF context
 */
interface PDFContextType {
  // Current document state
  currDocData: ArrayBuffer | undefined;
  currDocName: string | undefined;
  currDocPages: number | undefined;
  currDocPage: number;
  currDocText: string | undefined;
  pdfDocument: PDFDocumentProxy | undefined;
  setCurrentDocument: (id: string) => Promise<void>;
  clearCurrDoc: () => void;

  // PDF functionality
  onDocumentLoadSuccess: (pdf: PDFDocumentProxy) => void;
  highlightPattern: (text: string, pattern: string, containerRef: RefObject<HTMLDivElement>) => void;
  clearHighlights: () => void;
  clearWordHighlights: () => void;
  highlightWordIndex: (
    alignment: TTSSentenceAlignment | undefined,
    wordIndex: number | null | undefined,
    sentence: string | null | undefined,
    containerRef: RefObject<HTMLDivElement>
  ) => void;
  createFullAudioBook: (onProgress: (progress: number) => void, signal?: AbortSignal, onChapterComplete?: (chapter: { index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }) => void, bookId?: string, format?: 'mp3' | 'm4b') => Promise<string>;
  regenerateChapter: (chapterIndex: number, bookId: string, format: 'mp3' | 'm4b', signal: AbortSignal) => Promise<{ index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }>;
  isAudioCombining: boolean;
}

// Create the context
const PDFContext = createContext<PDFContextType | undefined>(undefined);

const CONTINUATION_PREVIEW_CHARS = 600;

/**
 * PDFProvider Component
 * 
 * Main provider component that manages PDF state and functionality.
 * Handles document loading, text processing, and integration with TTS.
 * 
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components to be wrapped by the provider
 */
export function PDFProvider({ children }: { children: ReactNode }) {
  const { 
    setText: setTTSText, 
    stop, 
    currDocPageNumber,
    currDocPages, 
    setCurrDocPages,
    setIsEPUB,
    registerVisualPageChangeHandler,
  } = useTTS();
  const { 
    headerMargin,
    footerMargin,
    leftMargin,
    rightMargin,
    apiKey,
    baseUrl,
    voiceSpeed,
    voice,
    ttsProvider,
    ttsModel,
    ttsInstructions,
    smartSentenceSplitting,
  } = useConfig();

  // Current document state
  const [currDocData, setCurrDocData] = useState<ArrayBuffer>();
  const [currDocName, setCurrDocName] = useState<string>();
  const [currDocText, setCurrDocText] = useState<string>();
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy>();
  const [isAudioCombining] = useState(false);
  const pageTextCacheRef = useRef<Map<number, string>>(new Map());
  const [currDocPage, setCurrDocPage] = useState<number>(currDocPageNumber);

  useEffect(() => {
    setCurrDocPage(currDocPageNumber);
  }, [currDocPageNumber]);

  /**
   * Handles successful PDF document load
   * 
   * @param {PDFDocumentProxy} pdf - The loaded PDF document proxy object
   */
  const onDocumentLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    console.log('Document loaded:', pdf.numPages);
    setCurrDocPages(pdf.numPages);
    setPdfDocument(pdf);
  }, [setCurrDocPages]);

  /**
   * Loads and processes text from the current document page
   * Extracts text from the PDF and updates both document text and TTS text states
   * 
   * @returns {Promise<void>}
   */
  const loadCurrDocText = useCallback(async () => {
    try {
      if (!pdfDocument) return;

      const margins = {
        header: headerMargin,
        footer: footerMargin,
        left: leftMargin,
        right: rightMargin
      };

      const getPageText = async (pageNumber: number, shouldCache = false): Promise<string> => {
        if (pageTextCacheRef.current.has(pageNumber)) {
          const cached = pageTextCacheRef.current.get(pageNumber)!;
          if (!shouldCache) {
            pageTextCacheRef.current.delete(pageNumber);
          }
          return cached;
        }

        const extracted = await extractTextFromPDF(pdfDocument, pageNumber, margins);
        if (shouldCache) {
          pageTextCacheRef.current.set(pageNumber, extracted);
        }
        return extracted;
      };

      const totalPages = currDocPages ?? pdfDocument.numPages;
      const nextPageNumber = currDocPageNumber < totalPages ? currDocPageNumber + 1 : undefined;

      const [text, nextText] = await Promise.all([
        getPageText(currDocPageNumber),
        nextPageNumber ? getPageText(nextPageNumber, true) : Promise.resolve<string | undefined>(undefined),
      ]);

      if (text !== currDocText || text === '') {
        setCurrDocText(text);
        setTTSText(text, {
          location: currDocPageNumber,
          nextLocation: nextPageNumber,
          nextText: nextText?.slice(0, CONTINUATION_PREVIEW_CHARS),
        });
      }
    } catch (error) {
      console.error('Error loading PDF text:', error);
    }
  }, [
    pdfDocument,
    currDocPageNumber,
    currDocPages,
    setTTSText,
    currDocText,
    headerMargin,
    footerMargin,
    leftMargin,
    rightMargin,
  ]);

  /**
   * Effect hook to update document text when the page changes
   * Triggers text extraction and processing when either the document URL or page changes
   */
  useEffect(() => {
    if (currDocData) {
      loadCurrDocText();
    }
  }, [currDocPageNumber, currDocData, loadCurrDocText]);

  /**
   * Sets the current document based on its ID
   * Retrieves document from IndexedDB
   * 
   * @param {string} id - The unique identifier of the document to set
   * @returns {Promise<void>}
   */
  const setCurrentDocument = useCallback(async (id: string): Promise<void> => {
    try {
      const doc = await getPdfDocument(id);
      if (doc) {
        setCurrDocName(doc.name);
        setCurrDocData(doc.data);
      }
    } catch (error) {
      console.error('Failed to get document:', error);
    }
  }, []);

  /**
   * Clears the current document state
   * Resets all document-related states and stops any ongoing TTS playback
   */
  const clearCurrDoc = useCallback(() => {
    setCurrDocName(undefined);
    setCurrDocData(undefined);
    setCurrDocText(undefined);
    setCurrDocPages(undefined);
    setPdfDocument(undefined);
    pageTextCacheRef.current.clear();
    stop();
  }, [setCurrDocPages, stop]);

  /**
   * Creates a complete audiobook by processing all PDF pages through NLP and TTS
   * @param {Function} onProgress - Callback for progress updates
   * @param {AbortSignal} signal - Optional signal for cancellation
   * @param {Function} onChapterComplete - Optional callback for when a chapter completes
   * @returns {Promise<string>} The bookId for the generated audiobook
   */
  const createFullAudioBook = useCallback(async (
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    onChapterComplete?: (chapter: { index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }) => void,
    providedBookId?: string,
    format: 'mp3' | 'm4b' = 'mp3'
  ): Promise<string> => {
    try {
      if (!pdfDocument) {
        throw new Error('No PDF document loaded');
      }

      // First pass: extract and measure all text
      const textPerPage: string[] = [];
      let totalLength = 0;
      
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const rawText = await extractTextFromPDF(pdfDocument, pageNum, {
          header: headerMargin,
          footer: footerMargin,
          left: leftMargin,
          right: rightMargin
        });
        const trimmedText = rawText.trim();
        if (trimmedText) {
          const processedText = smartSentenceSplitting
            ? processTextToSentences(trimmedText).join(' ')
            : trimmedText;

          textPerPage.push(processedText);
          totalLength += processedText.length;
        }
      }

      if (totalLength === 0) {
        throw new Error('No text content found in PDF');
      }

      let processedLength = 0;
      let bookId: string = providedBookId || '';

      // If we have a bookId, check for existing chapters to determine which indices already exist
      const existingIndices = new Set<number>();
      if (bookId) {
        try {
          const existingResponse = await fetch(`/api/audiobook/status?bookId=${bookId}`);
          if (existingResponse.ok) {
            const existingData = await existingResponse.json();
            if (existingData.chapters && existingData.chapters.length > 0) {
              for (const ch of existingData.chapters) {
                existingIndices.add(ch.index);
              }
              let nextMissing = 0;
              while (existingIndices.has(nextMissing)) nextMissing++;
              console.log(`Resuming; next missing page index is ${nextMissing} (page ${nextMissing + 1})`);
            }
          }
        } catch (error) {
          console.error('Error checking existing chapters:', error);
        }
      }

      // Second pass: process text into audio
      for (let i = 0; i < textPerPage.length; i++) {
        // Check for abort at the start of iteration
        if (signal?.aborted) {
          console.log('Generation cancelled by user');
          if (bookId) {
            return bookId; // Return bookId with partial progress
          }
          throw new Error('Audiobook generation cancelled');
        }

        const text = textPerPage[i];
        
        // Skip pages that already exist on disk (supports non-contiguous indices)
        if (existingIndices.has(i)) {
          processedLength += text.length;
          onProgress((processedLength / totalLength) * 100);
          continue;
        }

        const reqHeaders: TTSRequestHeaders = {
          'Content-Type': 'application/json',
          'x-openai-key': apiKey,
          'x-openai-base-url': baseUrl,
          'x-tts-provider': ttsProvider,
        };

        const reqBody: TTSRequestPayload = {
          text,
          voice: voice || (ttsProvider === 'openai' ? 'alloy' : (ttsProvider === 'deepinfra' ? 'af_bella' : 'af_sarah')),
          speed: voiceSpeed,
          format: 'mp3',
          model: ttsModel,
          instructions: ttsModel === 'gpt-4o-mini-tts' ? ttsInstructions : undefined
        };

        const retryOptions: TTSRetryOptions = {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 5000,
          backoffFactor: 2
        };

        try {
          const audioBuffer = await withRetry(
            async () => {
              // Check for abort before starting TTS request
              if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
              }

              const ttsResponse = await fetch('/api/tts', {
                method: 'POST',
                headers: reqHeaders,
                body: JSON.stringify(reqBody),
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
            retryOptions
          );

          const chapterTitle = `Page ${i + 1}`;

          // Check for abort before sending to server
          if (signal?.aborted) {
            console.log('Generation cancelled before saving page');
            if (bookId) {
              return bookId;
            }
            throw new Error('Audiobook generation cancelled');
          }

          // Send to server for conversion and storage
          const convertResponse = await fetch(`/api/audiobook`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chapterTitle,
              buffer: Array.from(new Uint8Array(audioBuffer)),
              bookId,
              format,
              chapterIndex: i
            }),
            signal
          });

          if (convertResponse.status === 499) {
            throw new Error('cancelled');
          }

          if (!convertResponse.ok) {
            throw new Error('Failed to convert audio chapter');
          }

          const { bookId: returnedBookId, chapterIndex, duration } = await convertResponse.json();
          
          if (!bookId) {
            bookId = returnedBookId;
          }

          // Notify about completed chapter
          if (onChapterComplete) {
            onChapterComplete({
              index: chapterIndex,
              title: chapterTitle,
              duration,
              status: 'completed',
              bookId,
              format
            });
          }

          processedLength += text.length;
          onProgress((processedLength / totalLength) * 100);

        } catch (error) {
          if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancelled'))) {
            console.log('TTS request aborted, returning partial progress');
            if (bookId) {
              return bookId; // Return with partial progress
            }
            throw new Error('Audiobook generation cancelled');
          }
          console.error('Error processing page:', error);
          
          // Notify about error
          if (onChapterComplete) {
            onChapterComplete({
              index: i,
              title: `Page ${i + 1}`,
              status: 'error',
              bookId,
              format
            });
          }
        }
      }

      if (!bookId) {
        throw new Error('No audio was generated from the PDF content');
      }

      return bookId;
    } catch (error) {
      console.error('Error creating audiobook:', error);
      throw error;
    }
  }, [pdfDocument, headerMargin, footerMargin, leftMargin, rightMargin, apiKey, baseUrl, voice, voiceSpeed, ttsProvider, ttsModel, ttsInstructions, smartSentenceSplitting]);

  /**
   * Regenerates a specific chapter (page) of the PDF audiobook
   */
  const regenerateChapter = useCallback(async (
    chapterIndex: number,
    bookId: string,
    format: 'mp3' | 'm4b',
    signal: AbortSignal
  ): Promise<{ index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }> => {
    try {
      if (!pdfDocument) {
        throw new Error('No PDF document loaded');
      }

      // IMPORTANT: Chapter indices are based on non-empty pages used during generation.
      // Build a mapping of "chapterIndex" -> actual PDF page number (1-based).
      const nonEmptyPages: number[] = [];
      for (let page = 1; page <= pdfDocument.numPages; page++) {
        const pageText = await extractTextFromPDF(pdfDocument, page, {
          header: headerMargin,
          footer: footerMargin,
          left: leftMargin,
          right: rightMargin
        });
        if (pageText.trim()) {
          nonEmptyPages.push(page);
        }
      }

      if (chapterIndex < 0 || chapterIndex >= nonEmptyPages.length) {
        throw new Error('Invalid chapter index');
      }

      const pageNum = nonEmptyPages[chapterIndex];

      // Extract text from the mapped page
      const rawText = await extractTextFromPDF(pdfDocument, pageNum, {
        header: headerMargin,
        footer: footerMargin,
        left: leftMargin,
        right: rightMargin
      });

      const trimmedText = rawText.trim();
      if (!trimmedText) {
        throw new Error('No text content found on page');
      }

      const textForTTS = smartSentenceSplitting
        ? processTextToSentences(trimmedText).join(' ')
        : trimmedText;

      // Use logical chapter numbering (index + 1) to match original generation titles
      const chapterTitle = `Page ${chapterIndex + 1}`;

      // Generate audio with retry logic
      const reqHeaders: TTSRequestHeaders = {
        'Content-Type': 'application/json',
        'x-openai-key': apiKey,
        'x-openai-base-url': baseUrl,
        'x-tts-provider': ttsProvider,
      };

      const reqBody: TTSRequestPayload = {
        text: textForTTS,
        voice: voice || (ttsProvider === 'openai' ? 'alloy' : (ttsProvider === 'deepinfra' ? 'af_bella' : 'af_sarah')),
        speed: voiceSpeed,
        format: 'mp3',
        model: ttsModel,
        instructions: ttsModel === 'gpt-4o-mini-tts' ? ttsInstructions : undefined
      };

      const retryOptions: TTSRetryOptions = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 2
      };

      const audioBuffer = await withRetry(
        async () => {
          if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          const ttsResponse = await fetch('/api/tts', {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify(reqBody),
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
        retryOptions
      );

      if (signal?.aborted) {
        throw new Error('Page regeneration cancelled');
      }

      // Send to server for conversion and storage
      const convertResponse = await fetch('/api/audiobook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chapterTitle,
          buffer: Array.from(new Uint8Array(audioBuffer)),
          bookId,
          format,
          chapterIndex
        }),
        signal
      });

      if (convertResponse.status === 499) {
        throw new Error('cancelled');
      }

      if (!convertResponse.ok) {
        throw new Error('Failed to convert audio chapter');
      }

      const { chapterIndex: returnedIndex, duration } = await convertResponse.json();

      return {
        index: returnedIndex,
        title: chapterTitle,
        duration,
        status: 'completed',
        bookId,
        format
      };

    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancelled'))) {
        throw new Error('Page regeneration cancelled');
      }
      console.error('Error regenerating page:', error);
      throw error;
    }
  }, [pdfDocument, headerMargin, footerMargin, leftMargin, rightMargin, apiKey, baseUrl, voice, voiceSpeed, ttsProvider, ttsModel, ttsInstructions, smartSentenceSplitting]);

  /**
   * Effect hook to initialize TTS as non-EPUB mode
   */
  useEffect(() => {
    setIsEPUB(false);
  }, [setIsEPUB]);

  useEffect(() => {
    registerVisualPageChangeHandler(location => {
      if (typeof location !== 'number') return;
      if (!pdfDocument) return;
      const totalPages = currDocPages ?? pdfDocument.numPages;
      const clamped = Math.min(Math.max(location, 1), totalPages);
      setCurrDocPage(clamped);
    });
  }, [registerVisualPageChangeHandler, currDocPages, pdfDocument]);

  // Context value memoization
  const contextValue = useMemo(
    () => ({
      onDocumentLoadSuccess,
      setCurrentDocument,
      currDocData,
      currDocName,
      currDocPages,
      currDocPage,
      currDocText,
      clearCurrDoc,
      highlightPattern,
      clearHighlights,
      clearWordHighlights,
      highlightWordIndex,
      pdfDocument,
      createFullAudioBook,
      regenerateChapter,
      isAudioCombining,
    }),
    [
      onDocumentLoadSuccess,
      setCurrentDocument,
      currDocData,
      currDocName,
      currDocPages,
      currDocPage,
      currDocText,
      clearCurrDoc,
      pdfDocument,
      createFullAudioBook,
      regenerateChapter,
      isAudioCombining,
    ]
  );

  return (
    <PDFContext.Provider value={contextValue}>
      {children}
    </PDFContext.Provider>
  );
}

/**
 * Custom hook to consume the PDF context
 * Ensures the context is used within a provider
 * 
 * @throws {Error} If used outside of PDFProvider
 * @returns {PDFContextType} The PDF context value containing all PDF-related functionality
 */
export function usePDF() {
  const context = useContext(PDFContext);
  if (context === undefined) {
    throw new Error('usePDF must be used within a PDFProvider');
  }
  return context;
}
