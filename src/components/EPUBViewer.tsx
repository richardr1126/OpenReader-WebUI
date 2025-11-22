'use client';

import { useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useEPUB } from '@/contexts/EPUBContext';
import { useTTS } from '@/contexts/TTSContext';
import { useConfig } from '@/contexts/ConfigContext';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';
import { useEPUBTheme, getThemeStyles } from '@/hooks/epub/useEPUBTheme';
import { useEPUBResize } from '@/hooks/epub/useEPUBResize';

const ReactReader = dynamic(() => import('react-reader').then(mod => mod.ReactReader), {
  ssr: false,
  loading: () => <DocumentSkeleton />
});

interface EPUBViewerProps {
  className?: string;
}

export function EPUBViewer({ className = '' }: EPUBViewerProps) {
  const {
    currDocData,
    currDocName,
    locationRef,
    handleLocationChanged,
    bookRef,
    renditionRef,
    tocRef,
    setRendition,
    extractPageText,
    highlightPattern,
    clearHighlights,
    highlightWordIndex,
    clearWordHighlights
  } = useEPUB();
  const {
    registerLocationChangeHandler,
    pause,
    currentSentence,
    currentSentenceAlignment,
    currentWordIndex
  } = useTTS();
  const { epubTheme, epubHighlightEnabled, epubWordHighlightEnabled } = useConfig();
  const { updateTheme } = useEPUBTheme(epubTheme, renditionRef.current);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isResizing, setIsResizing, dimensions } = useEPUBResize(containerRef);

  const checkResize = useCallback(() => {
    if (isResizing && dimensions && bookRef.current?.isOpen && renditionRef.current) {
      pause();
      // Only extract text when we have dimensions, ensuring the resize is complete
      extractPageText(bookRef.current, renditionRef.current, true);
      setIsResizing(false);

      return true;
    } else {
      return false;
    }
  }, [isResizing, setIsResizing, dimensions, pause, bookRef, renditionRef, extractPageText]);

  // Check for isResizing to pause TTS and re-extract text
  useEffect(() => {
    if (checkResize()) return;
  }, [checkResize]);

  // Register the location change handler
  useEffect(() => {
    registerLocationChangeHandler(handleLocationChanged);
  }, [registerLocationChangeHandler, handleLocationChanged]);

  // Handle highlighting
  useEffect(() => {
    if (currentSentence) {
      highlightPattern(currentSentence);
    } else {
      clearHighlights();
    }
  }, [currentSentence, highlightPattern, clearHighlights]);

  // Word-level highlight layered on top of the block highlight
  useEffect(() => {
    if (!epubHighlightEnabled || !epubWordHighlightEnabled) {
      clearWordHighlights();
      return;
    }

    if (currentWordIndex === null || currentWordIndex === undefined || currentWordIndex < 0) {
      clearWordHighlights();
      return;
    }

    if (!currentSentenceAlignment) {
      clearWordHighlights();
      return;
    }

    highlightWordIndex(
      currentSentenceAlignment,
      currentWordIndex,
      currentSentence || ''
    );
  }, [
    currentWordIndex,
    currentSentence,
    currentSentenceAlignment,
    epubHighlightEnabled,
    epubWordHighlightEnabled,
    clearWordHighlights,
    highlightWordIndex
  ]);

  if (!currDocData) {
    return <DocumentSkeleton />;
  }

  return (
    <div className={`h-full flex flex-col relative z-0 ${className}`} ref={containerRef}>
      <div className="flex-1">
        <ReactReader
          loadingView={<DocumentSkeleton />}
          key={'epub-reader'}
          location={locationRef.current}
          locationChanged={handleLocationChanged}
          url={currDocData}
          title={currDocName}
          tocChanged={(_toc) => (tocRef.current = _toc)}
          showToc={true}
          readerStyles={epubTheme && getThemeStyles() || undefined}
          getRendition={(_rendition) => {
            setRendition(_rendition);
            updateTheme();
          }}
        />
      </div>
    </div>
  );
}
