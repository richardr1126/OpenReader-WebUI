'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
  RefObject,
} from 'react';
import { indexedDBService } from '@/utils/indexedDB';
import { useTTS } from '@/contexts/TTSContext';
import { Book, Rendition } from 'epubjs';
import { createRangeCfi } from '@/utils/epub';
import type { NavItem } from 'epubjs';
import { setLastDocumentLocation } from '@/utils/indexedDB';
import { SpineItem } from 'epubjs/types/section';
import { useParams } from 'next/navigation';
import { useConfig } from './ConfigContext';
import { combineAudioChunks } from '@/utils/audio';
import { withRetry } from '@/utils/audio';

interface EPUBContextType {
  currDocData: ArrayBuffer | undefined;
  currDocName: string | undefined;
  currDocPages: number | undefined;
  currDocPage: number | string;
  currDocText: string | undefined;
  setCurrentDocument: (id: string) => Promise<void>;
  clearCurrDoc: () => void;
  extractPageText: (book: Book, rendition: Rendition, shouldPause?: boolean) => Promise<string>;
  createFullAudioBook: (onProgress: (progress: number) => void, signal?: AbortSignal, format?: 'mp3' | 'm4b') => Promise<ArrayBuffer>;
  bookRef: RefObject<Book | null>;
  renditionRef: RefObject<Rendition | undefined>;
  tocRef: RefObject<NavItem[]>;
  locationRef: RefObject<string | number>;
  handleLocationChanged: (location: string | number) => void;
  setRendition: (rendition: Rendition) => void;
  isAudioCombining: boolean;
}

const EPUBContext = createContext<EPUBContextType | undefined>(undefined);

/**
 * Provider component for EPUB functionality
 * Manages the state and operations for EPUB document handling
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components to be wrapped by the provider
 */
export function EPUBProvider({ children }: { children: ReactNode }) {
  const { setText: setTTSText, currDocPage, currDocPages, setCurrDocPages, stop, skipToLocation, setIsEPUB } = useTTS();
  const { id } = useParams();
  // Configuration context to get TTS settings
  const {
    apiKey,
    baseUrl,
    voiceSpeed,
    voice,
    provider,
    voiceProvider,
    providerSettings
  } = useConfig();
  // Current document state
  const [currDocData, setCurrDocData] = useState<ArrayBuffer>();
  const [currDocName, setCurrDocName] = useState<string>();
  const [currDocText, setCurrDocText] = useState<string>();
  const [isAudioCombining, setIsAudioCombining] = useState(false);

  // Add new refs
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | undefined>(undefined);
  const tocRef = useRef<NavItem[]>([]);
  const locationRef = useRef<string | number>(currDocPage);
  const isEPUBSetOnce = useRef(false);

  /**
   * Clears all current document state and stops any active TTS
   */
  const clearCurrDoc = useCallback(() => {
    setCurrDocData(undefined);
    setCurrDocName(undefined);
    setCurrDocText(undefined);
    setCurrDocPages(undefined);
    stop();
  }, [setCurrDocPages, stop]);

  /**
   * Sets the current document based on its ID by fetching from IndexedDB
   * @param {string} id - The unique identifier of the document
   * @throws {Error} When document data is empty or retrieval fails
   */
  const setCurrentDocument = useCallback(async (id: string): Promise<void> => {
    try {
      const doc = await indexedDBService.getEPUBDocument(id);
      if (doc) {
        console.log('Retrieved document size:', doc.size);
        console.log('Retrieved ArrayBuffer size:', doc.data.byteLength);

        if (doc.data.byteLength === 0) {
          console.error('Retrieved ArrayBuffer is empty');
          throw new Error('Empty document data');
        }

        setCurrDocName(doc.name);
        setCurrDocData(doc.data);  // Store ArrayBuffer directly
      } else {
        console.error('Document not found in IndexedDB');
      }
    } catch (error) {
      console.error('Failed to get EPUB document:', error);
      clearCurrDoc(); // Clean up on error
    }
  }, [clearCurrDoc]);

  /**
   * Extracts text content from the current EPUB page/location
   * @param {Book} book - The EPUB.js Book instance
   * @param {Rendition} rendition - The EPUB.js Rendition instance
   * @param {boolean} shouldPause - Whether to pause TTS
   * @returns {Promise<string>} The extracted text content
   */
  const extractPageText = useCallback(async (book: Book, rendition: Rendition, shouldPause = false): Promise<string> => {
    try {
      const { start, end } = rendition?.location;
      if (!start?.cfi || !end?.cfi || !book || !book.isOpen || !rendition) return '';

      const rangeCfi = createRangeCfi(start.cfi, end.cfi);

      const range = await book.getRange(rangeCfi);
      if (!range) {
        console.warn('Failed to get range from CFI:', rangeCfi);
        return '';
      }
      const textContent = range.toString().trim();

      setTTSText(textContent, shouldPause);
      setCurrDocText(textContent);

      return textContent;
    } catch (error) {
      console.error('Error extracting EPUB text:', error);
      return '';
    }
  }, [setTTSText]);

  /**
   * Extracts text content from the entire EPUB book
   * @returns {Promise<string[]>} Array of text content from each section
   */
  const extractBookText = useCallback(async (): Promise<Array<{ text: string; href: string }>> => {
    try {
      if (!bookRef.current || !bookRef.current.isOpen) return [{ text: '', href: '' }];

      const book = bookRef.current;
      const spine = book.spine;
      const promises: Promise<{ text: string; href: string }>[] = [];

      spine.each((item: SpineItem) => {
        const url = item.href || '';
        if (!url) return;
        //console.log('Extracting text from section:', item as SpineItem);

        const promise = book.load(url)
          .then((section) => (section as Document))
          .then((section) => ({
            text: section.body.textContent || '',
            href: url
          }))
          .catch((err) => {
            console.error(`Error loading section ${url}:`, err);
            return { text: '', href: url };
          });

        promises.push(promise);
      });

      const textArray = await Promise.all(promises);
      const filteredArray = textArray.filter(item => item.text.trim() !== '');
      console.log('Extracted entire EPUB text array:', filteredArray);
      return filteredArray;
    } catch (error) {
      console.error('Error extracting EPUB text:', error);
      return [{ text: '', href: '' }];
    }
  }, []);

  /**
   * Creates a complete audiobook by processing all text through NLP and TTS
   */
  const createFullAudioBook = useCallback(async (
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    format: 'mp3' | 'm4b' = 'mp3'
  ): Promise<ArrayBuffer> => {
    try {
      const sections = await extractBookText();
      if (!sections.length) throw new Error('No text content found in book');

      // Calculate total length for accurate progress tracking
      const totalLength = sections.reduce((sum, section) => sum + section.text.trim().length, 0);
      const audioChunks: { buffer: ArrayBuffer; title?: string; startTime: number }[] = [];
      let processedLength = 0;
      let currentTime = 0;

      // Get TOC for chapter titles
      const chapters = tocRef.current || [];
      console.log('Chapters:', chapters);
      
      // Create a map of section hrefs to their chapter titles
      const sectionTitleMap = new Map<string, string>();
      
      // First, loop through all chapters to create the mapping
      for (const chapter of chapters) {
        if (!chapter.href) continue;
        const chapterBaseHref = chapter.href.split('#')[0];
        const chapterTitle = chapter.label.trim();
        
        // For each chapter, find all matching sections
        for (const section of sections) {
          const sectionHref = section.href;
          const sectionBaseHref = sectionHref.split('#')[0];
          
          // If this section matches this chapter, map it
          if (sectionHref === chapter.href || sectionBaseHref === chapterBaseHref) {
            sectionTitleMap.set(sectionHref, chapterTitle);
          }
        }
      }
      
      console.log('Section to chapter title mapping:', sectionTitleMap);

      // Process each section
      for (let i = 0; i < sections.length; i++) {
        if (signal?.aborted) {
          const partialBuffer = await combineAudioChunks(audioChunks, format, setIsAudioCombining);
          return partialBuffer;
        }

        const section = sections[i];
        const trimmedText = section.text.trim();
        if (!trimmedText) continue;

        try {
          const audioBuffer = await withRetry(
            async () => {
              // Include provider information in the request
              const ttsResponse = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-provider-settings': JSON.stringify(providerSettings),
                },
                body: JSON.stringify({
                  text: trimmedText,
                  voice: voice,
                  speed: voiceSpeed,
                  format: format === 'm4b' ? 'aac' : 'mp3',
                  provider: provider,
                  voiceProvider: voiceProvider,
                  documentId: id?.toString()
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
              maxRetries: 2,
              initialDelay: 5000,
              maxDelay: 10000,
              backoffFactor: 2
            }
          );

          // Get the chapter title from our pre-computed map
          let chapterTitle = sectionTitleMap.get(section.href);
          
          // If no chapter title found, use index-based naming
          if (!chapterTitle) {
            chapterTitle = `Unknown Section - ${i + 1}`;
          }

          console.log('Processed audiobook chapter title:', chapterTitle);
          audioChunks.push({
            buffer: audioBuffer,
            title: chapterTitle,
            startTime: currentTime
          });

          // Add silence between sections
          const silenceBuffer = new ArrayBuffer(48000);
          audioChunks.push({
            buffer: silenceBuffer,
            startTime: currentTime + (audioBuffer.byteLength / 48000)
          });

          currentTime += (audioBuffer.byteLength + 48000) / 48000;
          processedLength += trimmedText.length;
          onProgress((processedLength / totalLength) * 100);

        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('TTS request aborted');
            const partialBuffer = await combineAudioChunks(audioChunks, format, setIsAudioCombining);
            return partialBuffer;
          }
          console.error('Error processing section:', error);
        }
      }

      if (audioChunks.length === 0) {
        throw new Error('No audio was generated from the book content');
      }

      return combineAudioChunks(audioChunks, format, setIsAudioCombining);
    } catch (error) {
      console.error('Error creating audiobook:', error);
      throw error;
    }
  }, [extractBookText, id, voice, voiceSpeed, provider, voiceProvider, providerSettings]);

  const setRendition = useCallback((rendition: Rendition) => {
    bookRef.current = rendition.book;
    renditionRef.current = rendition;
  }, []);

  const handleLocationChanged = useCallback((location: string | number) => {
    // Set the EPUB flag once the location changes
    if (!isEPUBSetOnce.current) {
      setIsEPUB(true);
      isEPUBSetOnce.current = true;

      renditionRef.current?.display(location.toString());
      return;
    }

    if (!bookRef.current?.isOpen || !renditionRef.current) return;

    // Handle special 'next' and 'prev' cases
    if (location === 'next' && renditionRef.current) {
      renditionRef.current.next();
      return;
    }
    if (location === 'prev' && renditionRef.current) {
      renditionRef.current.prev();
      return;
    }

    // Save the location to IndexedDB if not initial
    if (id && locationRef.current !== 1) {
      console.log('Saving location:', location);
      setLastDocumentLocation(id as string, location.toString());
    }

    skipToLocation(location);

    locationRef.current = location;
    if (bookRef.current && renditionRef.current) {
      extractPageText(bookRef.current, renditionRef.current);
    }
  }, [id, skipToLocation, extractPageText, setIsEPUB]);

  // Context value memoization
  const contextValue = useMemo(
    () => ({
      setCurrentDocument,
      currDocData,
      currDocName,
      currDocPages,
      currDocPage,
      currDocText,
      clearCurrDoc,
      extractPageText,
      createFullAudioBook,
      bookRef,
      renditionRef,
      tocRef,
      locationRef,
      handleLocationChanged,
      setRendition,
      isAudioCombining,
    }),
    [
      setCurrentDocument,
      currDocData,
      currDocName,
      currDocPages,
      currDocPage,
      currDocText,
      clearCurrDoc,
      extractPageText,
      createFullAudioBook,
      handleLocationChanged,
      setRendition,
      isAudioCombining,
    ]
  );

  return (
    <EPUBContext.Provider value={contextValue}>
      {children}
    </EPUBContext.Provider>
  );
}

/**
 * Custom hook to consume the EPUB context
 * @returns {EPUBContextType} The EPUB context value
 * @throws {Error} When used outside of EPUBProvider
 */
export function useEPUB() {
  const context = useContext(EPUBContext);
  if (context === undefined) {
    throw new Error('useEPUB must be used within an EPUBProvider');
  }
  return context;
}