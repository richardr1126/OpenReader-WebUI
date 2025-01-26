'use client';

import dynamic from 'next/dynamic';
import { usePDF } from '@/contexts/PDFContext';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { PDFSkeleton } from '@/components/PDFSkeleton';
import { useTTS } from '@/contexts/TTSContext';

// Dynamic import for client-side rendering only
const PDFViewer = dynamic(
  () => import('@/components/PDFViewer').then((module) => module.PDFViewer),
  { 
    ssr: false,
    loading: () => <PDFSkeleton />
  }
);

export default function PDFViewerPage() {
  const { id } = useParams();
  const { setCurrentDocument, currDocName } = usePDF();
  const { setText, stop } = useTTS();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  const loadDocument = useCallback(async () => {
    if (!isLoading) return; // Prevent calls when not loading new doc
    console.log('Loading new document (from page.tsx)');
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
  }, [isLoading, id, setCurrentDocument]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 200));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 50));

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-500 mb-4">{error}</p>
        <Link
          href="/"
          onClick={() => {
            setText('');
            stop();
          }}
          className="inline-flex items-center px-3 py-1 bg-base text-foreground rounded-lg hover:bg-offbase transition-colors"
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
      <div className="p-2 pb-2 border-b border-offbase">
        <div className="flex flex-wrap items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              onClick={() => {
                setText('');
                stop();
              }}
              className="inline-flex items-center px-3 py-1 bg-base text-foreground rounded-lg hover:bg-offbase transition-colors"
            >
              <svg className="w-4 h-4 mr-2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Documents
            </Link>
            <div className="bg-offbase px-2 py-0.5 rounded-full flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                className="text-xs hover:text-accent transition-colors"
                aria-label="Zoom out"
              >
                －
              </button>
              <span className="text-xs">{zoomLevel}%</span>
              <button
                onClick={handleZoomIn}
                className="text-xs hover:text-accent transition-colors"
                aria-label="Zoom in"
              >
                ＋
              </button>
            </div>
          </div>
          <h1 className="mr-2 text-md font-semibold text-foreground">
            {isLoading ? 'Loading...' : currDocName}
          </h1>
        </div>
      </div>
      {isLoading ? (
        <div className="p-4">
          <PDFSkeleton />
        </div>
      ) : (
        <PDFViewer zoomLevel={zoomLevel} />
      )}
    </>
  );
}
