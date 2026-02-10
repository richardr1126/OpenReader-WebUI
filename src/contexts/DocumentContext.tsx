'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { BaseDocument, DocumentType } from '@/types/documents';
import { listDocuments, uploadDocuments, deleteDocuments } from '@/lib/client-documents';
import { putCachedEpub, putCachedHtml, putCachedPdf, evictCachedEpub, evictCachedHtml, evictCachedPdf } from '@/lib/document-cache';

interface DocumentContextType {
  // PDF Documents
  pdfDocs: Array<BaseDocument & { type: 'pdf' }>;
  addPDFDocument: (file: File) => Promise<string>;
  removePDFDocument: (id: string) => Promise<void>;
  isPDFLoading: boolean;

  // EPUB Documents
  epubDocs: Array<BaseDocument & { type: 'epub' }>;
  addEPUBDocument: (file: File) => Promise<string>;
  removeEPUBDocument: (id: string) => Promise<void>;
  isEPUBLoading: boolean;

  // HTML Documents
  htmlDocs: Array<BaseDocument & { type: 'html' }>;
  addHTMLDocument: (file: File) => Promise<string>;
  removeHTMLDocument: (id: string) => Promise<void>;
  isHTMLLoading: boolean;

  refreshDocuments: () => Promise<void>;

  clearPDFs: () => Promise<void>;
  clearEPUBs: () => Promise<void>;
  clearHTML: () => Promise<void>;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<BaseDocument[] | null>(null);
  const isLoading = docs === null;

  const refreshDocuments = useCallback(async () => {
    const serverDocs = await listDocuments();
    // Keep only viewer-supported types
    setDocs(serverDocs.filter((d) => d.type === 'pdf' || d.type === 'epub' || d.type === 'html'));
  }, []);

  useEffect(() => {
    refreshDocuments().catch((err) => {
      console.error('Failed to load documents from server:', err);
      setDocs([]);
    });
  }, [refreshDocuments]);

  useEffect(() => {
    const handler = () => {
      refreshDocuments().catch((err) => {
        console.error('Failed to refresh documents after change event:', err);
      });
    };

    window.addEventListener('openreader:documentsChanged', handler as EventListener);
    return () => {
      window.removeEventListener('openreader:documentsChanged', handler as EventListener);
    };
  }, [refreshDocuments]);

  const docsByType = useMemo(() => {
    const pdfDocs = (docs ?? []).filter((d) => d.type === 'pdf') as Array<BaseDocument & { type: 'pdf' }>;
    const epubDocs = (docs ?? []).filter((d) => d.type === 'epub') as Array<BaseDocument & { type: 'epub' }>;
    const htmlDocs = (docs ?? []).filter((d) => d.type === 'html') as Array<BaseDocument & { type: 'html' }>;
    return { pdfDocs, epubDocs, htmlDocs };
  }, [docs]);

  const cacheUploaded = useCallback(async (stored: BaseDocument, file: File) => {
    try {
      if (stored.type === 'pdf') {
        await putCachedPdf(stored, await file.arrayBuffer());
      } else if (stored.type === 'epub') {
        await putCachedEpub(stored, await file.arrayBuffer());
      } else if (stored.type === 'html') {
        const buf = await file.arrayBuffer();
        const decoded = new TextDecoder().decode(new Uint8Array(buf));
        await putCachedHtml(stored, decoded);
      }
    } catch (err) {
      // Cache failures should not block uploads.
      console.warn('Failed to cache uploaded document:', stored.id, err);
    }
  }, []);

  const addDocument = useCallback(async (file: File): Promise<string> => {
    const [stored] = await uploadDocuments([file]);
    if (!stored) throw new Error('Upload succeeded but returned no document');
    await cacheUploaded(stored, file);
    setDocs((prev) => {
      const current = prev ?? [];
      // Replace if same id exists (e.g. re-upload)
      const next = current.filter((d) => d.id !== stored.id);
      return [stored, ...next];
    });
    return stored.id;
  }, [cacheUploaded]);

  const addPDFDocument = useCallback(async (file: File) => addDocument(file), [addDocument]);
  const addEPUBDocument = useCallback(async (file: File) => addDocument(file), [addDocument]);
  const addHTMLDocument = useCallback(async (file: File) => addDocument(file), [addDocument]);

  const removeById = useCallback(async (id: string) => {
    await deleteDocuments({ ids: [id] });
    await Promise.allSettled([evictCachedPdf(id), evictCachedEpub(id), evictCachedHtml(id)]);
    setDocs((prev) => (prev ?? []).filter((d) => d.id !== id));
  }, []);

  const removePDFDocument = useCallback(async (id: string) => removeById(id), [removeById]);
  const removeEPUBDocument = useCallback(async (id: string) => removeById(id), [removeById]);
  const removeHTMLDocument = useCallback(async (id: string) => removeById(id), [removeById]);

  const clearByType = useCallback(async (type: DocumentType) => {
    const toDelete = (docs ?? []).filter((d) => d.type === type).map((d) => d.id);
    if (toDelete.length) {
      await deleteDocuments({ ids: toDelete });
    }
    // Evict cache and update local list
    await Promise.allSettled(toDelete.map((id) => Promise.all([evictCachedPdf(id), evictCachedEpub(id), evictCachedHtml(id)])));
    setDocs((prev) => (prev ?? []).filter((d) => d.type !== type));
  }, [docs]);

  const clearPDFs = useCallback(async () => clearByType('pdf'), [clearByType]);
  const clearEPUBs = useCallback(async () => clearByType('epub'), [clearByType]);
  const clearHTML = useCallback(async () => clearByType('html'), [clearByType]);

  return (
    <DocumentContext.Provider value={{
      pdfDocs: docsByType.pdfDocs,
      addPDFDocument,
      removePDFDocument,
      isPDFLoading: isLoading,
      epubDocs: docsByType.epubDocs,
      addEPUBDocument,
      removeEPUBDocument,
      isEPUBLoading: isLoading,
      htmlDocs: docsByType.htmlDocs,
      addHTMLDocument,
      removeHTMLDocument,
      isHTMLLoading: isLoading,
      refreshDocuments,
      clearPDFs,
      clearEPUBs,
      clearHTML,
    }}>
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocuments() {
  const context = useContext(DocumentContext);
  if (context === undefined) {
    throw new Error('useDocuments must be used within a DocumentProvider');
  }
  return context;
}
