'use client';

import { RefObject, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useState, useEffect, useRef } from 'react';
import { PDFSkeleton } from './PDFSkeleton';
import { useTTS } from '@/contexts/TTSContext';
import { usePDF } from '@/contexts/PDFContext';
import { pdfjs } from 'react-pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import TTSPlayer from '@/components/player/TTSPlayer';

interface PDFViewerProps {
  pdfData: Blob | undefined;
  zoomLevel: number;
}

export function PDFViewer({ pdfData, zoomLevel }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>();
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const { setText, currentSentence, stopAndPlayFromIndex, isProcessing, isPlaying, currentIndex, sentences, stop } = useTTS();
  const [pdfText, setPdfText] = useState('');
  const [pdfDataUrl, setPdfDataUrl] = useState<string>();
  const [loadingError, setLoadingError] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const { extractTextFromPDF, highlightPattern, clearHighlights, handleTextClick } = usePDF();

  // Add static styles once during component initialization
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .react-pdf__Page__textContent span {
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    .react-pdf__Page__textContent span:hover {
      background-color: rgba(255, 255, 0, 0.2) !important;
    }
  `;
  document.head.appendChild(styleElement);

  // Cleanup styles when component unmounts
  useEffect(() => {
    return () => {
      styleElement.remove();
    };
  }, [styleElement]);

  useEffect(() => {
    /*
     * Converts PDF blob to a data URL for display.
     * Cleans up by clearing the data URL when component unmounts.
     * 
     * Dependencies:
     * - pdfData: Re-run when the PDF blob changes to convert it to a new data URL
     */
    if (!pdfData) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPdfDataUrl(reader.result as string);
    };
    reader.onerror = () => {
      console.error('Error reading file:', reader.error);
      setLoadingError('Failed to load PDF');
    };
    reader.readAsDataURL(pdfData);

    return () => {
      setPdfDataUrl(undefined);
    };
  }, [pdfData]);

  useEffect(() => {
    /*
     * Extracts text content from the PDF once it's loaded.
     * Sets the extracted text for both display and text-to-speech.
     * 
     * Dependencies:
     * - pdfDataUrl: Re-run when the data URL is ready
     * - extractTextFromPDF: Function from context that could change
     * - setText: Function from context that could change
     * - pdfData: Source PDF blob that's being processed
     */
    if (!pdfDataUrl || !pdfData) return;

    const loadPdfText = async () => {
      try {
        const text = await extractTextFromPDF(pdfData);
        setPdfText(text);
        setText(text);
      } catch (error) {
        console.error('Error loading PDF text:', error);
        setLoadingError('Failed to extract PDF text');
      }
    };

    loadPdfText();
  }, [pdfDataUrl, extractTextFromPDF, setText, pdfData]);

  useEffect(() => {
    /*
     * Sets up click event listeners for text selection in the PDF.
     * Cleans up by removing the event listener when component unmounts.
     * 
     * Dependencies:
     * - pdfText: Re-run when the extracted text content changes
     * - handleTextClick: Function from context that could change
     * - stopAndPlayFromIndex: Function from context that could change
     */
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event: MouseEvent) => handleTextClick(
      event,
      pdfText,
      containerRef as RefObject<HTMLDivElement>,
      stopAndPlayFromIndex,
      isProcessing
    );
    container.addEventListener('click', handleClick);
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [pdfText, handleTextClick, stopAndPlayFromIndex, isProcessing]);

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
    const highlightTimeout = setTimeout(() => {
      if (containerRef.current) {
        highlightPattern(pdfText, currentSentence || '', containerRef as RefObject<HTMLDivElement>);
      }
    }, 100);

    return () => {
      clearTimeout(highlightTimeout);
      clearHighlights();
    };
  }, [pdfText, currentSentence, highlightPattern, clearHighlights]);

  // Add scale calculation function
  const calculateScale = (pageWidth: number = 595) => {  // 595 is default PDF width in points
    const margin = 24; // 24px padding on each side
    const targetWidth = containerWidth - margin;
    const baseScale = targetWidth / pageWidth;
    return baseScale * (zoomLevel / 100);
  };

  // Add resize observer effect
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        setContainerWidth(width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  const [currentPage, setCurrentPage] = useState(1);
  const handlePageChange = useCallback(async (pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > (numPages || 1)) return;
        
    // Stop current playback and reset states
    if (isPlaying) {
      stop();
    }
    
    setCurrentPage(pageNumber);
    
    // Extract text from the new page
    if (pdfData) {
      try {
        const pdf = await pdfjs.getDocument(pdfDataUrl!).promise;
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.filter((item): item is TextItem => 
          'str' in item && 'transform' in item
        );
        
        // Process text items to maintain reading order
        const lines: TextItem[][] = [];
        let currentLine: TextItem[] = [];
        let currentY: number | null = null;
        const tolerance = 2;

        textItems.forEach((item) => {
          const y = item.transform[5];
          if (currentY === null) {
            currentY = y;
            currentLine.push(item);
          } else if (Math.abs(y - currentY) < tolerance) {
            currentLine.push(item);
          } else {
            lines.push(currentLine);
            currentLine = [item];
            currentY = y;
          }
        });
        lines.push(currentLine);

        // Build page text
        let fullText = '';
        for (const line of lines) {
          line.sort((a, b) => a.transform[4] - b.transform[4]);
          let lineText = '';
          let prevItem: TextItem | null = null;

          for (const item of line) {
            if (!prevItem) {
              lineText = item.str;
            } else {
              const prevEndX = prevItem.transform[4] + (prevItem.width ?? 0);
              const currentStartX = item.transform[4];
              const space = currentStartX - prevEndX;

              if (space > ((item.width ?? 0) * 0.3)) {
                lineText += ' ' + item.str;
              } else {
                lineText += item.str;
              }
            }
            prevItem = item;
          }
          fullText += lineText + ' ';
        }

        setText(fullText.trim()); // Update TTS with current page text
        
        // // Wait for text processing before resuming playback
        // await new Promise(resolve => setTimeout(resolve, 300));
        
        // if (wasPlaying) {
        //   stopAndPlayFromIndex(0);
        // }
      } catch (error) {
        console.error('Error extracting page text:', error);
      }
    }
  }, [isPlaying, pdfData, pdfDataUrl, numPages, setText, stop]);

  // Auto-advance to next page when TTS reaches the end
  useEffect(() => {
    if (!isPlaying && currentIndex >= sentences.length - 1 && currentPage < (numPages || 1)) {
      const timer = setTimeout(() => {
        handlePageChange(currentPage + 1);
      }, 500); // Longer delay to ensure states are settled
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentIndex, sentences.length, currentPage, numPages, handlePageChange]);

  return (
    <div ref={containerRef} className="flex flex-col items-center overflow-auto max-h-[calc(100vh-100px)] w-full px-6">
      {loadingError ? (
        <div className="text-red-500 mb-4">{loadingError}</div>
      ) : null}
      <Document
        loading={<PDFSkeleton />}
        noData={<PDFSkeleton />}
        file={pdfDataUrl}
        onLoadSuccess={(pdf) => {
          onDocumentLoadSuccess(pdf);
          handlePageChange(1); // Load first page text
        }}
        className="flex flex-col items-center m-0" 
      >
        <div>
          <div className="flex justify-center">
            <Page
              pageNumber={currentPage}
              renderAnnotationLayer={true}
              renderTextLayer={true}
              className="shadow-lg"
              scale={calculateScale()}
            />
          </div>
        </div>
      </Document>
      <TTSPlayer 
        currentPage={currentPage}
        numPages={numPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}