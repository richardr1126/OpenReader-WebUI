import Dexie, { type EntityTable } from 'dexie';
import { APP_CONFIG_DEFAULTS, type ViewType, type SavedVoices, type AppConfigRow } from '@/types/config';
import { PDFDocument, EPUBDocument, HTMLDocument, DocumentListState, SyncedDocument } from '@/types/documents';
import type { SummaryRow } from '@/types/summary';

const DB_NAME = 'openreader-db';
// Managed via Dexie (version bumped from the original manual IndexedDB)
const DB_VERSION = 6;

const PDF_TABLE = 'pdf-documents' as const;
const EPUB_TABLE = 'epub-documents' as const;
const HTML_TABLE = 'html-documents' as const;
const CONFIG_TABLE = 'config' as const;
const APP_CONFIG_TABLE = 'app-config' as const;
const LAST_LOCATION_TABLE = 'last-locations' as const;
const SUMMARIES_TABLE = 'summaries' as const;

export interface LastLocationRow {
  docId: string;
  location: string;
}

export interface ConfigRow {
  key: string;
  value: string;
}

type OpenReaderDB = Dexie & {
  [PDF_TABLE]: EntityTable<PDFDocument, 'id'>;
  [EPUB_TABLE]: EntityTable<EPUBDocument, 'id'>;
  [HTML_TABLE]: EntityTable<HTMLDocument, 'id'>;
  [CONFIG_TABLE]: EntityTable<ConfigRow, 'key'>;
  [APP_CONFIG_TABLE]: EntityTable<AppConfigRow, 'id'>;
  [LAST_LOCATION_TABLE]: EntityTable<LastLocationRow, 'docId'>;
  [SUMMARIES_TABLE]: EntityTable<SummaryRow, 'id'>;
};

export const db = new Dexie(DB_NAME) as OpenReaderDB;

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  'custom-openai': '',
};

type RawConfigMap = Record<string, string | undefined>;

function inferProviderAndBaseUrl(raw: RawConfigMap): { provider: string; baseUrl: string } {
  const cachedApiKey = raw.apiKey;
  const cachedBaseUrl = raw.baseUrl;
  let inferredProvider = raw.ttsProvider || '';

  if (!isDev && !raw.ttsProvider) {
    inferredProvider = 'deepinfra';
  } else if (!inferredProvider) {
    if (cachedBaseUrl) {
      const baseUrlLower = cachedBaseUrl.toLowerCase();
      if (baseUrlLower.includes('deepinfra.com')) {
        inferredProvider = 'deepinfra';
      } else if (baseUrlLower.includes('openai.com')) {
        inferredProvider = 'openai';
      } else if (
        baseUrlLower.includes('localhost') ||
        baseUrlLower.includes('127.0.0.1') ||
        baseUrlLower.includes('internal')
      ) {
        inferredProvider = 'custom-openai';
      } else {
        inferredProvider = cachedApiKey ? 'openai' : 'custom-openai';
      }
    } else {
      inferredProvider = cachedApiKey ? 'openai' : 'custom-openai';
    }
  }

  let baseUrl = cachedBaseUrl || '';
  if (!baseUrl) {
    if (inferredProvider === 'openai') {
      baseUrl = PROVIDER_DEFAULT_BASE_URL.openai;
    } else if (inferredProvider === 'deepinfra') {
      baseUrl = PROVIDER_DEFAULT_BASE_URL.deepinfra;
    } else {
      baseUrl = PROVIDER_DEFAULT_BASE_URL['custom-openai'];
    }
  }

  return { provider: inferredProvider, baseUrl };
}

function buildAppConfigFromRaw(raw: RawConfigMap): AppConfigRow {
  const { provider, baseUrl } = inferProviderAndBaseUrl(raw);

  let savedVoices: SavedVoices = {};
  if (raw.savedVoices) {
    try {
      savedVoices = JSON.parse(raw.savedVoices) as SavedVoices;
    } catch (error) {
      console.error('Error parsing savedVoices during migration:', error);
    }
  }

  let documentListState: DocumentListState = APP_CONFIG_DEFAULTS.documentListState;
  if (raw.documentListState) {
    try {
      documentListState = JSON.parse(raw.documentListState) as DocumentListState;
    } catch (error) {
      console.error('Error parsing documentListState during migration:', error);
    }
  }

  const config: AppConfigRow = {
    id: 'singleton',
    ...APP_CONFIG_DEFAULTS,
    apiKey: raw.apiKey ?? APP_CONFIG_DEFAULTS.apiKey,
    baseUrl,
    viewType: (raw.viewType as ViewType) || APP_CONFIG_DEFAULTS.viewType,
    voiceSpeed: raw.voiceSpeed ? parseFloat(raw.voiceSpeed) : APP_CONFIG_DEFAULTS.voiceSpeed,
    audioPlayerSpeed: raw.audioPlayerSpeed ? parseFloat(raw.audioPlayerSpeed) : APP_CONFIG_DEFAULTS.audioPlayerSpeed,
    voice: '',
    skipBlank: raw.skipBlank === 'false' ? false : APP_CONFIG_DEFAULTS.skipBlank,
    epubTheme: raw.epubTheme === 'true',
    smartSentenceSplitting:
      raw.smartSentenceSplitting === 'false' ? false : APP_CONFIG_DEFAULTS.smartSentenceSplitting,
    headerMargin: raw.headerMargin ? parseFloat(raw.headerMargin) : APP_CONFIG_DEFAULTS.headerMargin,
    footerMargin: raw.footerMargin ? parseFloat(raw.footerMargin) : APP_CONFIG_DEFAULTS.footerMargin,
    leftMargin: raw.leftMargin ? parseFloat(raw.leftMargin) : APP_CONFIG_DEFAULTS.leftMargin,
    rightMargin: raw.rightMargin ? parseFloat(raw.rightMargin) : APP_CONFIG_DEFAULTS.rightMargin,
    ttsProvider: provider || APP_CONFIG_DEFAULTS.ttsProvider,
    ttsModel:
      raw.ttsModel ||
      (provider === 'openai'
        ? 'tts-1'
        : provider === 'deepinfra'
        ? 'hexgrad/Kokoro-82M'
        : APP_CONFIG_DEFAULTS.ttsModel),
    ttsInstructions: raw.ttsInstructions ?? APP_CONFIG_DEFAULTS.ttsInstructions,
    savedVoices,
    pdfHighlightEnabled:
      raw.pdfHighlightEnabled === 'false' ? false : APP_CONFIG_DEFAULTS.pdfHighlightEnabled,
    pdfWordHighlightEnabled:
      raw.pdfWordHighlightEnabled === 'false' ? false : APP_CONFIG_DEFAULTS.pdfWordHighlightEnabled,
    epubHighlightEnabled:
      raw.epubHighlightEnabled === 'false' ? false : APP_CONFIG_DEFAULTS.epubHighlightEnabled,
    epubWordHighlightEnabled:
      raw.epubWordHighlightEnabled === 'false' ? false : APP_CONFIG_DEFAULTS.epubWordHighlightEnabled,
    firstVisit: raw.firstVisit === 'true',
    documentListState,
  };

  const voiceKey = `${config.ttsProvider}:${config.ttsModel}`;
  config.voice = config.savedVoices[voiceKey] || '';

  return config;
}

// Version 6: add summaries table for AI-generated document summaries.
// Previous version 5 introduced app-config and last-locations tables, migrated scattered config keys,
// and dropped the legacy config table.
db.version(DB_VERSION).stores({
  [PDF_TABLE]: 'id, type, name, lastModified, size, folderId',
  [EPUB_TABLE]: 'id, type, name, lastModified, size, folderId',
  [HTML_TABLE]: 'id, type, name, lastModified, size, folderId',
  [APP_CONFIG_TABLE]: 'id',
  [LAST_LOCATION_TABLE]: 'docId',
  [SUMMARIES_TABLE]: 'id, docId, [docId+pageNumber]',
  // `null` here means: drop the old 'config' table after upgrade runs,
  // but Dexie still lets us read it inside the upgrade transaction.
  [CONFIG_TABLE]: null,
}).upgrade(async (trans) => {
  const appConfig = await trans.table<AppConfigRow, string>(APP_CONFIG_TABLE).get('singleton');
  if (appConfig) {
    return;
  }

  const configRows = await trans.table<ConfigRow, string>(CONFIG_TABLE).toArray();
  const raw: RawConfigMap = {};

  for (const row of configRows) {
    raw[row.key] = row.value;
  }

  const built = buildAppConfigFromRaw(raw);
  await trans.table<AppConfigRow, string>(APP_CONFIG_TABLE).put(built);

  // Migrate any legacy lastLocation_* keys into the dedicated last-locations table.
  const locationTable = trans.table<LastLocationRow, string>(LAST_LOCATION_TABLE);
  for (const row of configRows) {
    if (row.key.startsWith('lastLocation_')) {
      const docId = row.key.substring('lastLocation_'.length);
      await locationTable.put({ docId, location: row.value });
    }
  }
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
    await db.transaction('readwrite', db[PDF_TABLE], db[LAST_LOCATION_TABLE], async () => {
      await db[PDF_TABLE].delete(id);
      await db[LAST_LOCATION_TABLE].delete(id);
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
    await db.transaction('readwrite', db[EPUB_TABLE], db[LAST_LOCATION_TABLE], async () => {
      await db[EPUB_TABLE].delete(id);
      await db[LAST_LOCATION_TABLE].delete(id);
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

export async function getAppConfig(): Promise<AppConfigRow | null> {
  return withDB(async () => {
    const row = await db[APP_CONFIG_TABLE].get('singleton');
    return row ?? null;
  });
}

export async function updateAppConfig(partial: Partial<AppConfigRow>): Promise<void> {
  await withDB(async () => {
    const table = db[APP_CONFIG_TABLE];
    const existing = await table.get('singleton');

    if (!existing) {
      await table.put({
        id: 'singleton',
        ...APP_CONFIG_DEFAULTS,
        ...partial,
      });
    } else {
      await table.update('singleton', partial);
    }
  });
}

// Document list state helpers

export async function saveDocumentListState(state: DocumentListState): Promise<void> {
  await updateAppConfig({ documentListState: state });
}

export async function getDocumentListState(): Promise<DocumentListState | null> {
  const config = await getAppConfig();
  if (!config || !config.documentListState) return null;
  return config.documentListState;
}

// Last-location helpers (used by TTS and readers)

export async function getLastDocumentLocation(docId: string): Promise<string | null> {
  return withDB(async () => {
    const row = await db[LAST_LOCATION_TABLE].get(docId);
    return row ? row.location : null;
  });
}

export async function setLastDocumentLocation(docId: string, location: string): Promise<void> {
  await withDB(async () => {
    await db[LAST_LOCATION_TABLE].put({ docId, location });
  });
}

// First-visit helpers (used for onboarding/Settings modal)

export async function getFirstVisit(): Promise<boolean> {
  const config = await getAppConfig();
  return config?.firstVisit ?? false;
}

export async function setFirstVisit(value: boolean): Promise<void> {
  await updateAppConfig({ firstVisit: value });
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

// Summary helpers (for AI-generated document summaries)

export async function saveSummary(summary: Omit<SummaryRow, 'id'>): Promise<string> {
  return withDB(async () => {
    const id = `${summary.docId}-${summary.scope}-${summary.pageNumber ?? 'all'}`;
    const now = Date.now();
    const existing = await db[SUMMARIES_TABLE].get(id);
    const row: SummaryRow = {
      ...summary,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db[SUMMARIES_TABLE].put(row);
    console.log('Saved summary:', id);
    return id;
  });
}

export async function getSummary(
  docId: string,
  docType: 'pdf' | 'epub' | 'html',
  pageNumber?: number | null
): Promise<SummaryRow | null> {
  return withDB(async () => {
    const scope = pageNumber != null ? 'page' : 'book';
    const id = `${docId}-${scope}-${pageNumber ?? 'all'}`;
    const row = await db[SUMMARIES_TABLE].get(id);
    return row ?? null;
  });
}

export async function getSummariesForDocument(docId: string): Promise<SummaryRow[]> {
  return withDB(async () => {
    return db[SUMMARIES_TABLE].where('docId').equals(docId).toArray();
  });
}

export async function deleteSummary(id: string): Promise<void> {
  await withDB(async () => {
    await db[SUMMARIES_TABLE].delete(id);
    console.log('Deleted summary:', id);
  });
}

export async function deleteSummariesForDocument(docId: string): Promise<void> {
  await withDB(async () => {
    await db[SUMMARIES_TABLE].where('docId').equals(docId).delete();
    console.log('Deleted all summaries for document:', docId);
  });
}
