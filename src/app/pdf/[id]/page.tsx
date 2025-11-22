'use client';

import dynamic from 'next/dynamic';
import { usePDF } from '@/contexts/PDFContext';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';
import { useTTS } from '@/contexts/TTSContext';
import { DocumentSettings } from '@/components/DocumentSettings';
import { SettingsIcon, DownloadIcon } from '@/components/icons/Icons';
import { Header } from '@/components/Header';
import { ZoomControl } from '@/components/ZoomControl';
import { AudiobookExportModal } from '@/components/AudiobookExportModal';
import type { TTSAudiobookChapter, TTSAudiobookFormat } from '@/types/tts';
import TTSPlayer from '@/components/player/TTSPlayer';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

// Dynamic import for client-side rendering only
const PDFViewer = dynamic(
  () => import('@/components/PDFViewer').then((module) => module.PDFViewer),
  { 
    ssr: false,
    loading: () => <DocumentSkeleton />
  }
);

export default function PDFViewerPage() {
  const { id } = useParams();
  const { setCurrentDocument, currDocName, clearCurrDoc, currDocPage, currDocPages, createFullAudioBook: createPDFAudioBook, regenerateChapter: regeneratePDFChapter } = usePDF();
  const { stop } = useTTS();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAudiobookModalOpen, setIsAudiobookModalOpen] = useState(false);
  const [containerHeight, setContainerHeight] = useState<string>('auto');

  const loadDocument = useCallback(async () => {
    if (!isLoading) return; // Prevent calls when not loading new doc
    console.log('Loading new document (from page.tsx)');
    stop(); // Reset TTS when loading new document
    try {
      if (!id) {
        setError('Document not found');
        return;
      }
      setCurrentDocument(id as string);
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, id, setCurrentDocument, stop]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Compute available height = viewport - (header height + tts bar height)
  useEffect(() => {
    const compute = () => {
      const header = document.querySelector('[data-app-header]') as HTMLElement | null;
      const ttsbar = document.querySelector('[data-app-ttsbar]') as HTMLElement | null;
      const headerH = header ? header.getBoundingClientRect().height : 0;
      const ttsH = ttsbar ? ttsbar.getBoundingClientRect().height : 0;
      const vh = window.innerHeight;
      const h = Math.max(0, vh - headerH - ttsH);
      setContainerHeight(`${h}px`);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 300));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 50));

  const handleGenerateAudiobook = useCallback(async (
    onProgress: (progress: number) => void,
    signal: AbortSignal,
    onChapterComplete: (chapter: TTSAudiobookChapter) => void,
    format: TTSAudiobookFormat
  ) => {
    return createPDFAudioBook(onProgress, signal, onChapterComplete, id as string, format);
  }, [createPDFAudioBook, id]);

  const handleRegenerateChapter = useCallback(async (
    chapterIndex: number,
    bookId: string,
    format: TTSAudiobookFormat,
    signal: AbortSignal
  ) => {
    return regeneratePDFChapter(chapterIndex, bookId, format, signal);
  }, [regeneratePDFChapter]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-500 mb-4">{error}</p>
        <Link
          href="/"
          onClick={() => {clearCurrDoc();}}
          className="inline-flex items-center px-3 py-1 bg-base text-foreground rounded-lg hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
        >
          <svg className="w-4 h-4 mr-2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Documents
        </Link>
      </div>
    );
  }

  return (
    <>
      <Header
        left={
          <Link
            href="/"
            onClick={() => clearCurrDoc()}
            className="inline-flex items-center py-1 px-2 rounded-md border border-offbase bg-base text-foreground text-xs hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
            aria-label="Back to documents"
          >
            <svg className="w-3 h-3 mr-2" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Documents
          </Link>
        }
        title={isLoading ? 'Loading…' : (currDocName || '')}
        right={
          <div className="flex items-center gap-2">
            <ZoomControl value={zoomLevel} onIncrease={handleZoomIn} onDecrease={handleZoomOut} />
            {isDev && (
              <button
                onClick={() => setIsAudiobookModalOpen(true)}
                className="inline-flex items-center py-1 px-2 rounded-md border border-offbase bg-base text-foreground text-xs hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.09] hover:text-accent"
                aria-label="Open audiobook export"
                title="Export Audiobook"
              >
                <DownloadIcon className="w-4 h-4 transform transition-transform duration-200 ease-in-out hover:scale-[1.09] hover:text-accent" />
              </button>
            )}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center py-1 px-2 rounded-md border border-offbase bg-base text-foreground text-xs hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.09] hover:text-accent"
              aria-label="Open settings"
            >
              <SettingsIcon className="w-4 h-4 transform transition-transform duration-200 ease-in-out hover:scale-[1.09] hover:rotate-45 hover:text-accent" />
            </button>
          </div>
        }
      />
      <div className="overflow-hidden" style={{ height: containerHeight }}>
        {isLoading ? (
          <div className="p-4">
            <DocumentSkeleton />
          </div>
        ) : (
          <PDFViewer zoomLevel={zoomLevel} />
        )}
      </div>
      {isDev && (
        <AudiobookExportModal
          isOpen={isAudiobookModalOpen}
          setIsOpen={setIsAudiobookModalOpen}
          documentType="pdf"
          documentId={id as string}
          onGenerateAudiobook={handleGenerateAudiobook}
          onRegenerateChapter={handleRegenerateChapter}
        />
      )}
      <TTSPlayer currentPage={currDocPage} numPages={currDocPages} />
      <DocumentSettings isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
    </>
  );
}
