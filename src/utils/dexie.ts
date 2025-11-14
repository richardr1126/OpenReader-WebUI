import Dexie, { type EntityTable } from 'dexie';
import {
  PDFDocument,
  EPUBDocument,
  HTMLDocument,
  DocumentListState,
  SyncedDocument,
} from '@/types/documents';

const DB_NAME = 'openreader-db';
// Managed via Dexie (version bumped from the original manual IndexedDB)
const DB_VERSION = 4;

const PDF_TABLE = 'pdf-documents' as const;
const EPUB_TABLE = 'epub-documents' as const;
const HTML_TABLE = 'html-documents' as const;
const CONFIG_TABLE = 'config' as const;

export interface ConfigRow {
  key: string;
  value: string;
}

type OpenReaderDB = Dexie & {
  [PDF_TABLE]: EntityTable<PDFDocument, 'id'>;
  [EPUB_TABLE]: EntityTable<EPUBDocument, 'id'>;
  [HTML_TABLE]: EntityTable<HTMLDocument, 'id'>;
  [CONFIG_TABLE]: EntityTable<ConfigRow, 'key'>;
};

export const db = new Dexie(DB_NAME) as OpenReaderDB;

db.version(DB_VERSION).stores({
  [PDF_TABLE]: 'id, type, name, lastModified, size, folderId',
  [EPUB_TABLE]: 'id, type, name, lastModified, size, folderId',
  [HTML_TABLE]: 'id, type, name, lastModified, size, folderId',
  [CONFIG_TABLE]: 'key',
});

let dbOpenPromise: Promise<void> | null = null;

export async function initDB(): Promise<void> {
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = (async () => {
    try {
      console.log('Opening Dexie database...');
      await db.open();
      console.log('Dexie database opened successfully');
    } catch (error) {
      console.error('Dexie initialization error:', error);
      dbOpenPromise = null;
      throw error;
    }
  })();

  return dbOpenPromise;
}

async function withDB<T>(operation: () => Promise<T>): Promise<T> {
  await initDB();
  return operation();
}

// PDF document helpers

export async function addPdfDocument(document: PDFDocument): Promise<void> {
  await withDB(async () => {
    console.log('Adding PDF document via Dexie:', document.name);
    await db[PDF_TABLE].put(document);
  });
}

export async function getPdfDocument(id: string): Promise<PDFDocument | undefined> {
  return withDB(async () => {
    console.log('Fetching PDF document via Dexie:', id);
    return db[PDF_TABLE].get(id);
  });
}

export async function getAllPdfDocuments(): Promise<PDFDocument[]> {
  return withDB(async () => {
    console.log('Fetching all PDF documents via Dexie');
    return db[PDF_TABLE].toArray();
  });
}

export async function removePdfDocument(id: string): Promise<void> {
  await withDB(async () => {
    console.log('Removing PDF document via Dexie:', id);
    const locationKey = `lastLocation_${id}`;
    await db.transaction('readwrite', db[PDF_TABLE], db[CONFIG_TABLE], async () => {
      await db[PDF_TABLE].delete(id);
      await db[CONFIG_TABLE].delete(locationKey);
    });
  });
}

export async function clearPdfDocuments(): Promise<void> {
  await withDB(async () => {
    console.log('Clearing all PDF documents via Dexie');
    await db[PDF_TABLE].clear();
  });
}

// EPUB document helpers

export async function addEpubDocument(document: EPUBDocument): Promise<void> {
  await withDB(async () => {
    if (document.data.byteLength === 0) {
      throw new Error('Cannot store empty ArrayBuffer');
    }

    console.log('Adding EPUB document via Dexie:', {
      name: document.name,
      size: document.size,
      actualSize: document.data.byteLength,
    });

    await db[EPUB_TABLE].put(document);
  });
}

export async function getEpubDocument(id: string): Promise<EPUBDocument | undefined> {
  return withDB(async () => {
    console.log('Fetching EPUB document via Dexie:', id);
    return db[EPUB_TABLE].get(id);
  });
}

export async function getAllEpubDocuments(): Promise<EPUBDocument[]> {
  return withDB(async () => {
    console.log('Fetching all EPUB documents via Dexie');
    return db[EPUB_TABLE].toArray();
  });
}

export async function removeEpubDocument(id: string): Promise<void> {
  await withDB(async () => {
    console.log('Removing EPUB document via Dexie:', id);
    const locationKey = `lastLocation_${id}`;
    await db.transaction('readwrite', db[EPUB_TABLE], db[CONFIG_TABLE], async () => {
      await db[EPUB_TABLE].delete(id);
      await db[CONFIG_TABLE].delete(locationKey);
    });
  });
}

export async function clearEpubDocuments(): Promise<void> {
  await withDB(async () => {
    console.log('Clearing all EPUB documents via Dexie');
    await db[EPUB_TABLE].clear();
  });
}

// HTML / text document helpers

export async function addHtmlDocument(document: HTMLDocument): Promise<void> {
  await withDB(async () => {
    console.log('Adding HTML document via Dexie:', document.name);
    await db[HTML_TABLE].put(document);
  });
}

export async function getHtmlDocument(id: string): Promise<HTMLDocument | undefined> {
  return withDB(async () => {
    console.log('Fetching HTML document via Dexie:', id);
    return db[HTML_TABLE].get(id);
  });
}

export async function getAllHtmlDocuments(): Promise<HTMLDocument[]> {
  return withDB(async () => {
    console.log('Fetching all HTML documents via Dexie');
    return db[HTML_TABLE].toArray();
  });
}

export async function removeHtmlDocument(id: string): Promise<void> {
  await withDB(async () => {
    console.log('Removing HTML document via Dexie:', id);
    await db[HTML_TABLE].delete(id);
  });
}

export async function clearHtmlDocuments(): Promise<void> {
  await withDB(async () => {
    console.log('Clearing all HTML documents via Dexie');
    await db[HTML_TABLE].clear();
  });
}

// Config helpers

export async function setConfigItem(key: string, value: string): Promise<void> {
  await withDB(async () => {
    console.log('Setting config item via Dexie:', key);
    await db[CONFIG_TABLE].put({ key, value });
  });
}

export async function getConfigItem(key: string): Promise<string | null> {
  const row = await withDB(() => db[CONFIG_TABLE].get(key));
  console.log('Fetching config item via Dexie:', key, row ? 'found' : 'not found');
  return row ? row.value : null;
}

export async function getAllConfigItems(): Promise<Record<string, string>> {
  const rows = await withDB(() => db[CONFIG_TABLE].toArray());
  const config: Record<string, string> = {};
  rows.forEach((row) => {
    config[row.key] = row.value;
  });
  console.log('Fetched config items via Dexie:', rows.length);
  return config;
}

export async function removeConfigItem(key: string): Promise<void> {
  await withDB(async () => {
    console.log('Removing config item via Dexie:', key);
    await db[CONFIG_TABLE].delete(key);
  });
}

// Legacy-style config accessors retained for convenience

export const getItem = getConfigItem;
export const setItem = setConfigItem;
export const removeItem = removeConfigItem;

// Document list state helpers

export async function saveDocumentListState(state: DocumentListState): Promise<void> {
  await setConfigItem('documentListState', JSON.stringify(state));
}

export async function getDocumentListState(): Promise<DocumentListState | null> {
  const stateStr = await getConfigItem('documentListState');
  if (!stateStr) return null;
  try {
    return JSON.parse(stateStr);
  } catch (error) {
    console.error('Error parsing document list state:', error);
    return null;
  }
}

// Last-location helpers (used by TTS and readers)

export async function getLastDocumentLocation(docId: string): Promise<string | null> {
  const key = `lastLocation_${docId}`;
  return getConfigItem(key);
}

export async function setLastDocumentLocation(docId: string, location: string): Promise<void> {
  const key = `lastLocation_${docId}`;
  await setConfigItem(key, location);
}

// Sync helpers (server round-trip)

export async function syncDocumentsToServer(
  onProgress?: (progress: number, status?: string) => void,
  signal?: AbortSignal,
): Promise<{ lastSync: number }> {
  const pdfDocs = await getAllPdfDocuments();
  const epubDocs = await getAllEpubDocuments();
  const htmlDocs = await getAllHtmlDocuments();

  const documents: SyncedDocument[] = [];
  const totalDocs = pdfDocs.length + epubDocs.length + htmlDocs.length;
  let processedDocs = 0;

  for (const doc of pdfDocs) {
    documents.push({
      ...doc,
      type: 'pdf',
      data: Array.from(new Uint8Array(doc.data)),
    });
    processedDocs++;
    if (onProgress) {
      onProgress((processedDocs / totalDocs) * 50, `Processing ${processedDocs}/${totalDocs} documents...`);
    }
  }

  for (const doc of epubDocs) {
    documents.push({
      ...doc,
      type: 'epub',
      data: Array.from(new Uint8Array(doc.data)),
    });
    processedDocs++;
    if (onProgress) {
      onProgress((processedDocs / totalDocs) * 50, `Processing ${processedDocs}/${totalDocs} documents...`);
    }
  }

  const encoder = new TextEncoder();
  for (const doc of htmlDocs) {
    const encoded = encoder.encode(doc.data);
    documents.push({
      ...doc,
      type: 'html',
      data: Array.from(encoded),
    });
    processedDocs++;
    if (onProgress) {
      onProgress((processedDocs / totalDocs) * 50, `Processing ${processedDocs}/${totalDocs} documents...`);
    }
  }

  if (onProgress) {
    onProgress(50, 'Uploading to server...');
  }

  const response = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents }),
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to sync documents to server');
  }

  if (onProgress) {
    onProgress(100, 'Upload complete!');
  }

  return { lastSync: Date.now() };
}

export async function loadDocumentsFromServer(
  onProgress?: (progress: number, status?: string) => void,
  signal?: AbortSignal,
): Promise<{ lastSync: number }> {
  if (onProgress) {
    onProgress(10, 'Starting download...');
  }

  const response = await fetch('/api/documents', { signal });
  if (!response.ok) {
    throw new Error('Failed to fetch documents from server');
  }

  if (onProgress) {
    onProgress(30, 'Download complete');
  }

  const { documents } = (await response.json()) as { documents: SyncedDocument[] };

  if (onProgress) {
    onProgress(40, 'Parsing documents...');
  }

  const textDecoder = new TextDecoder();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    if (doc.type === 'pdf') {
      const uint8Array = new Uint8Array(doc.data);
      const documentData: PDFDocument = {
        id: doc.id,
        type: 'pdf',
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        data: uint8Array.buffer,
      };
      await addPdfDocument(documentData);
    } else if (doc.type === 'epub') {
      const uint8Array = new Uint8Array(doc.data);
      const documentData: EPUBDocument = {
        id: doc.id,
        type: 'epub',
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        data: uint8Array.buffer,
      };
      await addEpubDocument(documentData);
    } else if (doc.type === 'html') {
      const uint8Array = new Uint8Array(doc.data);
      const decoded = textDecoder.decode(uint8Array);
      const documentData: HTMLDocument = {
        id: doc.id,
        type: 'html',
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        data: decoded,
      };
      await addHtmlDocument(documentData);
    } else {
      console.warn(`Unknown document type: ${doc.type}`);
    }

    if (onProgress) {
      onProgress(40 + ((i + 1) / documents.length) * 50, `Processing document ${i + 1}/${documents.length}...`);
    }
  }

  if (onProgress) {
    onProgress(100, 'Load complete!');
  }

  return { lastSync: Date.now() };
}

