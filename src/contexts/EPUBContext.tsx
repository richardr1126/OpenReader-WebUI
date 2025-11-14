'use client';

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
  RefObject
} from 'react';
import { getEpubDocument, setLastDocumentLocation } from '@/utils/dexie';
import { useTTS } from '@/contexts/TTSContext';
import { Book, Rendition } from 'epubjs';
import { createRangeCfi } from '@/utils/epub';
import type { NavItem } from 'epubjs';
import { SpineItem } from 'epubjs/types/section';
import { useParams } from 'next/navigation';
import { useConfig } from './ConfigContext';
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
  createFullAudioBook: (onProgress: (progress: number) => void, signal?: AbortSignal, onChapterComplete?: (chapter: { index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }) => void, bookId?: string, format?: 'mp3' | 'm4b') => Promise<string>;
  regenerateChapter: (chapterIndex: number, bookId: string, format: 'mp3' | 'm4b', onProgress: (progress: number) => void, signal: AbortSignal) => Promise<{ index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }>;
  bookRef: RefObject<Book | null>;
  renditionRef: RefObject<Rendition | undefined>;
  tocRef: RefObject<NavItem[]>;
  locationRef: RefObject<string | number>;
  handleLocationChanged: (location: string | number) => void;
  setRendition: (rendition: Rendition) => void;
  isAudioCombining: boolean;
}

const EPUBContext = createContext<EPUBContextType | undefined>(undefined);

const EPUB_CONTINUATION_CHARS = 600;

const stepToNextNode = (node: Node | null, root: Node): Node | null => {
  if (!node) return null;
  if (node.firstChild) {
    return node.firstChild;
  }

  let current: Node | null = node;
  while (current) {
    if (current === root) {
      return null;
    }
    if (current.nextSibling) {
      return current.nextSibling;
    }
    current = current.parentNode;
  }

  return null;
};

const getNextTextNode = (node: Node | null, root: Node): Text | null => {
  let next = stepToNextNode(node, root);
  while (next) {
    if (next.nodeType === Node.TEXT_NODE) {
      return next as Text;
    }
    next = stepToNextNode(next, root);
  }
  return null;
};

const collectContinuationFromRange = (range: Range | null | undefined, limit = EPUB_CONTINUATION_CHARS): string => {
  if (typeof window === 'undefined' || !range) {
    return '';
  }

  const root = range.commonAncestorContainer;
  if (!root) {
    return '';
  }

  const parts: string[] = [];
  let remaining = limit;

  const appendFromTextNode = (textNode: Text, offset: number) => {
    if (remaining <= 0) return;
    const textContent = textNode.textContent || '';
    if (offset >= textContent.length) return;
    const slice = textContent.slice(offset, offset + remaining);
    if (slice) {
      parts.push(slice);
      remaining -= slice.length;
    }
  };

  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    appendFromTextNode(range.endContainer as Text, range.endOffset);
    let nextNode = getNextTextNode(range.endContainer, root);
    while (nextNode && remaining > 0) {
      appendFromTextNode(nextNode, 0);
      nextNode = getNextTextNode(nextNode, root);
    }
  } else {
    let nextNode = getNextTextNode(range.endContainer, root);
    while (nextNode && remaining > 0) {
      appendFromTextNode(nextNode, 0);
      nextNode = getNextTextNode(nextNode, root);
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

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
    ttsProvider,
    ttsModel,
    ttsInstructions,
    smartSentenceSplitting,
  } = useConfig();
  // Current document state
  const [currDocData, setCurrDocData] = useState<ArrayBuffer>();
  const [currDocName, setCurrDocName] = useState<string>();
  const [currDocText, setCurrDocText] = useState<string>();
  const [isAudioCombining] = useState(false);

  // Add new refs
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | undefined>(undefined);
  const tocRef = useRef<NavItem[]>([]);
  const locationRef = useRef<string | number>(currDocPage);
  const isEPUBSetOnce = useRef(false);
  // Should pause ref
  const shouldPauseRef = useRef(true);

  /**
   * Clears all current document state and stops any active TTS
   */
  const clearCurrDoc = useCallback(() => {
    setCurrDocData(undefined);
    setCurrDocName(undefined);
    setCurrDocText(undefined);
    setCurrDocPages(undefined);
    isEPUBSetOnce.current = false;
    bookRef.current = null;
    renditionRef.current = undefined;
    locationRef.current = 1;
    tocRef.current = [];
    stop();
  }, [setCurrDocPages, stop]);

  /**
   * Sets the current document based on its ID by fetching from IndexedDB
   * @param {string} id - The unique identifier of the document
   * @throws {Error} When document data is empty or retrieval fails
   */
  const setCurrentDocument = useCallback(async (id: string): Promise<void> => {
    try {
      const doc = await getEpubDocument(id);
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
      const continuationPreview = collectContinuationFromRange(range);

      if (smartSentenceSplitting) {
        setTTSText(textContent, {
          shouldPause,
          location: start.cfi,
          nextLocation: end.cfi,
          nextText: continuationPreview
        });
      } else {
        // When smart splitting is disabled, behave like the original implementation:
        // send only the current page/location text without any continuation preview.
        setTTSText(textContent, {
          shouldPause,
          location: start.cfi,
        });
      }
      setCurrDocText(textContent);

      return textContent;
    } catch (error) {
      console.error('Error extracting EPUB text:', error);
      return '';
    }
  }, [setTTSText, smartSentenceSplitting]);

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
    onChapterComplete?: (chapter: { index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }) => void,
    providedBookId?: string,
    format: 'mp3' | 'm4b' = 'mp3'
  ): Promise<string> => {
    try {
      const sections = await extractBookText();
      if (!sections.length) throw new Error('No text content found in book');

      // Calculate total length for accurate progress tracking
      const totalLength = sections.reduce((sum, section) => sum + section.text.trim().length, 0);
      let processedLength = 0;
      let bookId: string = providedBookId || '';

      // Get TOC for chapter titles
      const chapters = tocRef.current || [];
      
      // If we have a bookId, check for existing chapters to determine which indices already exist
      const existingIndices = new Set<number>();
      if (bookId) {
        try {
          const existingResponse = await fetch(`/api/audio/convert/chapters?bookId=${bookId}`);
          if (existingResponse.ok) {
            const existingData = await existingResponse.json();
            if (existingData.chapters && existingData.chapters.length > 0) {
              for (const ch of existingData.chapters) {
                existingIndices.add(ch.index);
              }
              // Log smallest missing index for visibility
              let nextMissing = 0;
              while (existingIndices.has(nextMissing)) nextMissing++;
              console.log(`Resuming; next missing chapter index is ${nextMissing}`);
            }
          }
        } catch (error) {
          console.error('Error checking existing chapters:', error);
        }
      }
      
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

      // Process each section
      for (let i = 0; i < sections.length; i++) {
        // Check for abort at the start of iteration
        if (signal?.aborted) {
          console.log('Generation cancelled by user');
          if (bookId) {
            return bookId; // Return bookId with partial progress
          }
          throw new Error('Audiobook generation cancelled');
        }

        const section = sections[i];
        const trimmedText = section.text.trim();
        if (!trimmedText) continue;

        // Skip chapters that already exist on disk (supports non-contiguous indices)
        if (existingIndices.has(i)) {
          processedLength += trimmedText.length;
          onProgress((processedLength / totalLength) * 100);
          continue;
        }

        try {
          const audioBuffer = await withRetry(
            async () => {
              // Check for abort before starting TTS request
              if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
              }

              const ttsResponse = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-openai-key': apiKey,
                  'x-openai-base-url': baseUrl,
                  'x-tts-provider': ttsProvider,
                },
                body: JSON.stringify({
                  text: trimmedText,
                  voice: voice || (ttsProvider === 'openai' ? 'alloy' : (ttsProvider === 'deepinfra' ? 'af_bella' : 'af_sarah')),
                  speed: voiceSpeed,
                  format: 'mp3',
                  model: ttsModel,
                  instructions: ttsModel === 'gpt-4o-mini-tts' ? ttsInstructions : undefined
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
            chapterTitle = `Chapter ${i + 1}`;
          }

          // Check for abort before sending to server
          if (signal?.aborted) {
            console.log('Generation cancelled before saving chapter');
            if (bookId) {
              return bookId;
            }
            throw new Error('Audiobook generation cancelled');
          }

          // Send to server for conversion and storage
          const convertResponse = await fetch('/api/audio/convert', {
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

          processedLength += trimmedText.length;
          onProgress((processedLength / totalLength) * 100);

        } catch (error) {
          if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('cancelled'))) {
            console.log('TTS request aborted, returning partial progress');
            if (bookId) {
              return bookId; // Return with partial progress
            }
            throw new Error('Audiobook generation cancelled');
          }
          console.error('Error processing section:', error);
          
          // Notify about error
          if (onChapterComplete) {
            onChapterComplete({
              index: i,
              title: sectionTitleMap.get(section.href) || `Chapter ${i + 1}`,
              status: 'error',
              bookId,
              format
            });
          }
        }
      }

      if (!bookId) {
        throw new Error('No audio was generated from the book content');
      }

      return bookId;
    } catch (error) {
      console.error('Error creating audiobook:', error);
      throw error;
    }
  }, [extractBookText, apiKey, baseUrl, voice, voiceSpeed, ttsProvider, ttsModel, ttsInstructions]);

  /**
   * Regenerates a specific chapter of the audiobook
   */
  const regenerateChapter = useCallback(async (
    chapterIndex: number,
    bookId: string,
    format: 'mp3' | 'm4b',
    onProgress: (progress: number) => void,
    signal: AbortSignal
  ): Promise<{ index: number; title: string; duration?: number; status: 'pending' | 'generating' | 'completed' | 'error'; bookId?: string; format?: 'mp3' | 'm4b' }> => {
    try {
      const sections = await extractBookText();
      if (chapterIndex >= sections.length) {
        throw new Error('Invalid chapter index');
      }

      const section = sections[chapterIndex];
      const trimmedText = section.text.trim();
      
      if (!trimmedText) {
        throw new Error('No text content found in chapter');
      }

      // Get TOC for chapter title
      const chapters = tocRef.current || [];
      const sectionTitleMap = new Map<string, string>();
      
      for (const chapter of chapters) {
        if (!chapter.href) continue;
        const chapterBaseHref = chapter.href.split('#')[0];
        const chapterTitle = chapter.label.trim();
        
        for (const sect of sections) {
          const sectionHref = sect.href;
          const sectionBaseHref = sectionHref.split('#')[0];
          
          if (sectionHref === chapter.href || sectionBaseHref === chapterBaseHref) {
            sectionTitleMap.set(sectionHref, chapterTitle);
          }
        }
      }

      const chapterTitle = sectionTitleMap.get(section.href) || `Chapter ${chapterIndex + 1}`;

      // Generate audio with retry logic
      const audioBuffer = await withRetry(
        async () => {
          if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          const ttsResponse = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-openai-key': apiKey,
              'x-openai-base-url': baseUrl,
              'x-tts-provider': ttsProvider,
            },
            body: JSON.stringify({
              text: trimmedText,
              voice: voice || (ttsProvider === 'openai' ? 'alloy' : (ttsProvider === 'deepinfra' ? 'af_bella' : 'af_sarah')),
              speed: voiceSpeed,
              format: 'mp3',
              model: ttsModel,
              instructions: ttsModel === 'gpt-4o-mini-tts' ? ttsInstructions : undefined
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

      if (signal?.aborted) {
        throw new Error('Chapter regeneration cancelled');
      }

      // Send to server for conversion and storage
      const convertResponse = await fetch('/api/audio/convert', {
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
        throw new Error('Chapter regeneration cancelled');
      }
      console.error('Error regenerating chapter:', error);
      throw error;
    }
  }, [extractBookText, apiKey, baseUrl, voice, voiceSpeed, ttsProvider, ttsModel, ttsInstructions]);

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
      shouldPauseRef.current = false;
      renditionRef.current.next();
      return;
    }
    if (location === 'prev' && renditionRef.current) {
      shouldPauseRef.current = false;
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
      extractPageText(bookRef.current, renditionRef.current, shouldPauseRef.current);
      shouldPauseRef.current = true;
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
      regenerateChapter,
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
      regenerateChapter,
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
