'use client';

import dynamic from 'next/dynamic';
import { usePDF } from '@/contexts/PDFContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';
import { useTTS } from '@/contexts/TTSContext';
import { DocumentSettings } from '@/components/DocumentSettings';
import { SettingsIcon, DownloadIcon } from '@/components/icons/Icons';
import { Header } from '@/components/Header';
import { ZoomControl } from '@/components/ZoomControl';
import { AudiobookExportModal } from '@/components/AudiobookExportModal';
import type { TTSAudiobookChapter } from '@/types/tts';
import type { AudiobookGenerationSettings } from '@/types/client';
import TTSPlayer from '@/components/player/TTSPlayer';
import { SummarizeButton } from '@/components/SummarizeButton';
import { SummarizeModal } from '@/components/SummarizeModal';
import { extractTextFromPDF } from '@/lib/pdf';
import type { SummarizeMode } from '@/types/summary';
import { resolveDocumentId } from '@/lib/dexie';

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
  const router = useRouter();
  const { setCurrentDocument, currDocName, clearCurrDoc, currDocPage, currDocPages, createFullAudioBook: createPDFAudioBook, regenerateChapter: regeneratePDFChapter, pdfDocument } = usePDF();
  const { stop } = useTTS();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAudiobookModalOpen, setIsAudiobookModalOpen] = useState(false);
  const [isSummarizeModalOpen, setIsSummarizeModalOpen] = useState(false);
  const [containerHeight, setContainerHeight] = useState<string>('auto');

  const loadDocument = useCallback(async () => {
    if (!isLoading) return; // Prevent calls when not loading new doc
    console.log('Loading new document (from page.tsx)');
    stop(); // Reset TTS when loading new document
    let didRedirect = false;
    try {
      if (!id) {
        setError('Document not found');
        return;
      }
      const resolved = await resolveDocumentId(id as string);
      if (resolved !== (id as string)) {
        didRedirect = true;
        router.replace(`/pdf/${resolved}`);
        return;
      }
      setCurrentDocument(resolved);
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Failed to load document');
    } finally {
      if (!didRedirect) {
        setIsLoading(false);
      }
    }
  }, [isLoading, id, router, setCurrentDocument, stop]);

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
    settings: AudiobookGenerationSettings
  ) => {
    return createPDFAudioBook(onProgress, signal, onChapterComplete, id as string, settings.format, settings);
  }, [createPDFAudioBook, id]);

  const handleRegenerateChapter = useCallback(async (
    chapterIndex: number,
    bookId: string,
    settings: AudiobookGenerationSettings,
    signal: AbortSignal
  ) => {
    return regeneratePDFChapter(chapterIndex, bookId, settings.format, signal, settings);
  }, [regeneratePDFChapter]);

  const handleExtractTextForSummary = useCallback(async (mode: SummarizeMode, pageNumber?: number): Promise<string> => {
    if (!pdfDocument) {
      throw new Error('PDF document not loaded');
    }

    const margins = { header: 0.07, footer: 0.07, left: 0.07, right: 0.07 };

    if (mode === 'whole_book') {
      const textParts: string[] = [];
      for (let page = 1; page <= pdfDocument.numPages; page++) {
        const pageText = await extractTextFromPDF(pdfDocument, page, margins);
        if (pageText) {
          textParts.push(pageText);
        }
      }
      return textParts.join('\n\n');
    } else {
      const targetPage = pageNumber ?? currDocPage ?? 1;
      return extractTextFromPDF(pdfDocument, targetPage, margins);
    }
  }, [pdfDocument, currDocPage]);

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
            <SummarizeButton onClick={() => setIsSummarizeModalOpen(true)} disabled={!pdfDocument} />
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
      <SummarizeModal
        isOpen={isSummarizeModalOpen}
        setIsOpen={setIsSummarizeModalOpen}
        docId={id as string}
        docType="pdf"
        currentPage={currDocPage}
        totalPages={currDocPages}
        onExtractText={handleExtractTextForSummary}
      />
      <TTSPlayer currentPage={currDocPage} numPages={currDocPages} />
      <DocumentSettings isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
    </>
  );
}
