'use client';

import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useHTML } from '@/contexts/HTMLContext';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';

interface HTMLViewerProps {
  className?: string;
}

export function HTMLViewer({ className = '' }: HTMLViewerProps) {
  const {
    currDocData,
    currDocName,
    chapters,
    currentChapterIndex,
    totalChapters,
    goToNextChapter,
    goToPreviousChapter,
  } = useHTML();
  const containerRef = useRef<HTMLDivElement>(null);

  if (!currDocData) {
    return <DocumentSkeleton />;
  }

  // Check if the file is a txt file
  const isTxtFile = currDocName?.toLowerCase().endsWith('.txt');
  const hasChapters = totalChapters > 1;
  const currentChapter = hasChapters ? chapters[currentChapterIndex] : null;

  return (
    <div className={`flex flex-col h-full ${className}`} ref={containerRef}>
      {/* Chapter navigation header */}
      {hasChapters && (
        <div className="flex items-center justify-between px-4 py-2 bg-offbase border-b border-muted">
          <button
            onClick={goToPreviousChapter}
            disabled={currentChapterIndex === 0}
            className="inline-flex items-center px-3 py-1 text-sm rounded-md border border-muted bg-base text-foreground hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            aria-label="Previous chapter"
          >
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Previous
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground font-medium">
              {currentChapter?.title || `Chapter ${currentChapterIndex + 1}`}
            </span>
            <span className="text-xs text-muted">
              ({currentChapterIndex + 1} of {totalChapters})
            </span>
          </div>

          <button
            onClick={goToNextChapter}
            disabled={currentChapterIndex === totalChapters - 1}
            className="inline-flex items-center px-3 py-1 text-sm rounded-md border border-muted bg-base text-foreground hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            aria-label="Next chapter"
          >
            Next
            <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className={`html-container min-w-full px-4 py-4 ${isTxtFile ? 'whitespace-pre-wrap font-mono text-sm' : 'prose prose-base'}`}>
          {isTxtFile ? (
            currDocData
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {currDocData}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
