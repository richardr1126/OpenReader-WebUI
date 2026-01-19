'use client';

import { useParams } from "next/navigation";
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useHTML } from '@/contexts/HTMLContext';
import { DocumentSkeleton } from '@/components/DocumentSkeleton';
import { HTMLViewer } from '@/components/HTMLViewer';
import { DocumentSettings } from '@/components/DocumentSettings';
import { SettingsIcon } from '@/components/icons/Icons';
import { Header } from '@/components/Header';
import { useTTS } from "@/contexts/TTSContext";
import TTSPlayer from '@/components/player/TTSPlayer';
import { ZoomControl } from '@/components/ZoomControl';
import { SummarizeButton } from '@/components/SummarizeButton';
import { SummarizeModal } from '@/components/SummarizeModal';
import type { SummarizeMode } from '@/types/summary';

export default function HTMLPage() {
  const { id } = useParams();
  const { setCurrentDocument, currDocName, clearCurrDoc, currDocText } = useHTML();
  const { stop } = useTTS();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSummarizeModalOpen, setIsSummarizeModalOpen] = useState(false);
  const [containerHeight, setContainerHeight] = useState<string>('auto');
  const [padPct, setPadPct] = useState<number>(100); // 0..100 (100 = full width)
  const [maxPadPx, setMaxPadPx] = useState<number>(0);

  const loadDocument = useCallback(async () => {
    if (!isLoading) return;
    console.log('Loading new HTML document (from page.tsx)');
    stop();
    try {
      if (!id) {
        setError('Document not found');
        return;
      }
      await setCurrentDocument(id as string);
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

      // Adaptive minimum content width: allow some padding on narrow screens
      const vw = window.innerWidth;
      const desiredMin = 640;
      const minContent = Math.min(desiredMin, Math.max(320, vw - 32));
      const maxPad = Math.max(0, Math.floor((vw - minContent) / 2));
      setMaxPadPx(maxPad);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExtractTextForSummary = useCallback(async (_mode: SummarizeMode): Promise<string> => {
    if (!currDocText) {
      throw new Error('Document text not loaded');
    }
    // For HTML documents, we always return the full text (no page concept)
    return currDocText;
  }, [currDocText]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-500 mb-4">{error}</p>
        <Link
          href="/"
          onClick={() => {clearCurrDoc();}}
          className="inline-flex items-center px-3 py-1 bg-base text-foreground rounded-lg hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="flex items-center gap-3">
            <ZoomControl
              value={padPct}
              onIncrease={() => setPadPct(p => Math.min(p + 10, 100))} // Increase = less padding
              onDecrease={() => setPadPct(p => Math.max(p - 10, 0))}   // Decrease = add padding
              min={0}
              max={100}
            />
            <SummarizeButton onClick={() => setIsSummarizeModalOpen(true)} disabled={!currDocText} />
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center h-8 px-2.5 rounded-md border border-offbase bg-base text-foreground text-xs md:text-sm hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.09] hover:text-accent"
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
          <div className="h-full w-full" style={{ paddingLeft: `${Math.round(maxPadPx * ((100 - padPct)/100))}px`, paddingRight: `${Math.round(maxPadPx * ((100 - padPct)/100))}px` }}>
            <HTMLViewer className="h-full" />
          </div>
        )}
      </div>
      <SummarizeModal
        isOpen={isSummarizeModalOpen}
        setIsOpen={setIsSummarizeModalOpen}
        docId={id as string}
        docType="html"
        onExtractText={handleExtractTextForSummary}
      />
      <TTSPlayer />
      <DocumentSettings html isOpen={isSettingsOpen} setIsOpen={setIsSettingsOpen} />
    </>
  );
}
