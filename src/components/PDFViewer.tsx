'use client';

import { RefObject, useCallback, useState, useEffect, useRef } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';
import { useTTS } from '@/contexts/TTSContext';
import { usePDF } from '@/contexts/PDFContext';
import { useConfig } from '@/contexts/ConfigContext';
import { usePDFResize } from '@/hooks/pdf/usePDFResize';

interface PDFViewerProps {
  zoomLevel: number;
}

interface OnItemClickArgs {
  pageNumber?: number;
  dest?: unknown;
}

export function PDFViewer({ zoomLevel }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<number>(1);
  const { containerWidth } = usePDFResize(containerRef);

  // Config context
  const { viewType, pdfHighlightEnabled } = useConfig();

  // TTS context
  const {
    currentSentence,
    skipToLocation,
  } = useTTS();

  // PDF context
  const {
    highlightPattern,
    clearHighlights,
    onDocumentLoadSuccess,
    currDocData,
    currDocPages,
    currDocText,
    currDocPage,
  } = usePDF();

  useEffect(() => {
    /*
     * Handles highlighting the current sentence being read by TTS.
     * Includes a small delay for smooth highlighting and cleans up on unmount.
     * 
     * Dependencies:
     * - pdfText: Re-run when the text content changes
     * - currentSentence: Re-run when the TTS position changes
     * - highlightPattern: Function from context that could change
     * - clearHighlights: Function from context that could change
     */

    if (!currDocText || !pdfHighlightEnabled) {
      clearHighlights();
      return;
    }

    const highlightTimeout = setTimeout(() => {
      if (containerRef.current) {
        highlightPattern(currDocText, currentSentence || '', containerRef as RefObject<HTMLDivElement>);
      }
    }, 200);

    return () => {
      clearTimeout(highlightTimeout);
      clearHighlights();
    };
  }, [currDocText, currentSentence, highlightPattern, clearHighlights, pdfHighlightEnabled]);

  // Add page dimensions state
  const [pageWidth, setPageWidth] = useState<number>(595); // default A4 width
  const [pageHeight, setPageHeight] = useState<number>(842); // default A4 height

  // Calculate which pages to show based on viewType
  const leftPage = viewType === 'dual' 
    ? (currDocPage % 2 === 0 ? currDocPage - 1 : currDocPage)
    : currDocPage;
  const rightPage = viewType === 'dual'
    ? (currDocPage % 2 === 0 ? currDocPage : currDocPage + 1)
    : null;

  // Modify scale calculation to be more efficient
  const calculateScale = useCallback((width = pageWidth, height = pageHeight): number => {
    const margin = viewType === 'dual' ? 48 : 24; // adjust margin based on view type
    const containerHeight = (containerRef.current?.clientHeight ?? window.innerHeight);
    const targetWidth = viewType === 'dual'
      ? (containerWidth - margin) / 2 // divide by 2 for dual pages
      : containerWidth - margin;
    const targetHeight = containerHeight - margin;

    if (viewType === 'scroll') {
      // For scroll mode, use a more comfortable width-based scale
      // Use 75% of the width-based scale to make it less zoomed in
      const scaleByWidth = (targetWidth / width) * 0.75;
      return scaleByWidth * (zoomLevel / 100);
    }

    const scaleByWidth = targetWidth / width;
    const scaleByHeight = targetHeight / height;

    const baseScale = Math.min(scaleByWidth, scaleByHeight);
    return baseScale * (zoomLevel / 100);
  }, [containerWidth, zoomLevel, pageWidth, pageHeight, viewType]);

  // Add memoized scale to prevent unnecessary recalculations
  const currentScale = useCallback(() => {
    const newScale = calculateScale();
    if (Math.abs(newScale - scaleRef.current) > 0.01) {
      scaleRef.current = newScale;
    }
    return scaleRef.current;
  }, [calculateScale]);

  return (
    <div ref={containerRef} className="flex flex-col items-center overflow-auto w-full px-6 h-full">
      <Document
        loading={<DocumentSkeleton />}
        noData={<DocumentSkeleton />}
        file={currDocData}
        onLoadSuccess={(pdf) => {
          onDocumentLoadSuccess(pdf);
        }}
        onItemClick={(args: OnItemClickArgs) => {
          if (args?.pageNumber) {
            skipToLocation(args.pageNumber, true);
          } else if (args?.dest) {
            const destArray = Array.isArray(args.dest) ? args.dest : [];
            const pageNum = typeof destArray[0] === 'number' ? destArray[0] + 1 : undefined;
            if (pageNum) {
              skipToLocation(pageNum, true);
            }
          }
        }}
        className="flex flex-col items-center m-0 z-0" 
      >
        <div>
          {viewType === 'scroll' ? (
            // Scroll mode: render all pages
            <div className="flex flex-col gap-4">
              {currDocPages && [...Array(currDocPages)].map((_, i) => (
                <Page
                  key={`page_${i + 1}`}
                  pageNumber={i + 1}
                  renderAnnotationLayer={true}
                  renderTextLayer={i + 1 === currDocPage}
                  className="shadow-lg"
                  scale={currentScale()}
                  onLoadSuccess={(page) => {
                    setPageWidth(page.originalWidth);
                    setPageHeight(page.originalHeight);
                  }}
                />
              ))}
            </div>
          ) : (
            // Single/Dual page mode
            <div className="flex justify-center gap-4">
              {currDocPages && leftPage > 0 && (
                <Page
                  key={`page_${leftPage}`}
                  pageNumber={leftPage}
                  renderAnnotationLayer={true}
                  renderTextLayer={leftPage === currDocPage}
                  className="shadow-lg"
                  scale={currentScale()}
                  onLoadSuccess={(page) => {
                    setPageWidth(page.originalWidth);
                    setPageHeight(page.originalHeight);
                  }}
                />
              )}
              {currDocPages && rightPage && rightPage <= currDocPages && viewType === 'dual' && (
                <Page
                  key={`page_${rightPage}`}
                  pageNumber={rightPage}
                  renderAnnotationLayer={true}
                  renderTextLayer={rightPage === currDocPage}
                  className="shadow-lg"
                  scale={currentScale()}
                  onLoadSuccess={(page) => {
                    setPageWidth(page.originalWidth);
                    setPageHeight(page.originalHeight);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </Document>
    </div>
  );
}
