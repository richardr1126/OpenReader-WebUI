import Dexie, { type EntityTable } from 'dexie';
import { APP_CONFIG_DEFAULTS, type ViewType, type SavedVoices, type AppConfigRow } from '@/types/config';
import {
  PDFDocument,
  EPUBDocument,
  HTMLDocument,
  DocumentListState,
  SyncedDocument,
  BaseDocument,
  DocumentListDocument,
} from '@/types/documents';
import type { SummaryRow } from '@/types/summary';
import { sha256HexFromBytes, sha256HexFromString } from '@/lib/sha256';

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
const DOCUMENT_ID_MAP_TABLE = 'document-id-map' as const;

export interface LastLocationRow {
  docId: string;
  location: string;
}

export interface DocumentIdMapRow {
  oldId: string;
  id: string;
  createdAt: number;
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
  [DOCUMENT_ID_MAP_TABLE]: EntityTable<DocumentIdMapRow, 'oldId'>;
};

export const db = new Dexie(DB_NAME) as OpenReaderDB;

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

type DexieOpenStatus = 'opening' | 'opened' | 'blocked' | 'stalled' | 'error';

function emitDexieStatus(status: DexieOpenStatus, detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('openreader:dexie', {
        detail: { status, ...detail },
      }),
    );
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  // Fired when this tab's open/upgrade is blocked by another tab holding the DB open.
  db.on('blocked', () => {
    emitDexieStatus('blocked');
  });
}

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

// Version 6: add summaries table for AI-generated document summaries and document-id-map table.
// Previous version 5 introduced app-config and last-locations tables, migrated scattered config keys,
// and dropped the legacy config table.
db.version(DB_VERSION).stores({
  [PDF_TABLE]: 'id, type, name, lastModified, size, folderId',
  [EPUB_TABLE]: 'id, type, name, lastModified, size, folderId',
  [HTML_TABLE]: 'id, type, name, lastModified, size, folderId',
  [APP_CONFIG_TABLE]: 'id',
  [LAST_LOCATION_TABLE]: 'docId',
  [SUMMARIES_TABLE]: 'id, docId, [docId+pageNumber]',
  [DOCUMENT_ID_MAP_TABLE]: 'oldId, id, createdAt',
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
      emitDexieStatus('opening');
      const startedAt = Date.now();
      const stallTimer = setTimeout(() => {
        emitDexieStatus('stalled', { ms: Date.now() - startedAt });
      }, 4000);
      await db.open();
      clearTimeout(stallTimer);
      console.log('Dexie database opened successfully');
      emitDexieStatus('opened');
    } catch (error) {
      console.error('Dexie initialization error:', error);
      emitDexieStatus('error', { message: error instanceof Error ? error.message : String(error) });
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

function isSha256HexId(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

async function getMappedDocumentId(docId: string): Promise<string> {
  if (isSha256HexId(docId)) return docId.toLowerCase();
  const row = await db[DOCUMENT_ID_MAP_TABLE].get(docId);
  return row?.id ?? docId;
}

export async function resolveDocumentId(docId: string): Promise<string> {
  return withDB(async () => getMappedDocumentId(docId));
}

async function recordDocumentIdMapping(oldId: string, id: string): Promise<void> {
  if (oldId === id) return;
  await db[DOCUMENT_ID_MAP_TABLE].put({ oldId, id, createdAt: Date.now() });
}

function rewriteDocumentListStateDocIds(state: DocumentListState, mapping: Map<string, string>): DocumentListState {
  let didChange = false;

  const folders = state.folders.map((folder) => {
    let folderChanged = false;
    const seen = new Set<string>();
    const documents: DocumentListDocument[] = [];

    for (const doc of folder.documents) {
      const mappedId = mapping.get(doc.id) ?? doc.id;
      if (mappedId !== doc.id) folderChanged = true;
      if (seen.has(mappedId)) {
        folderChanged = true;
        continue;
      }
      seen.add(mappedId);
      documents.push(mappedId === doc.id ? doc : { ...doc, id: mappedId });
    }

    if (!folderChanged) return folder;
    didChange = true;
    return { ...folder, documents };
  });

  return didChange ? { ...state, folders } : state;
}

async function applyDocumentIdMapping(oldId: string, newId: string): Promise<void> {
  if (!oldId || !newId || oldId === newId) return;
  const nextId = newId.toLowerCase();

  await withDB(async () => {
    await db.transaction(
      'readwrite',
      [
        db[PDF_TABLE],
        db[EPUB_TABLE],
        db[HTML_TABLE],
        db[LAST_LOCATION_TABLE],
        db[APP_CONFIG_TABLE],
        db[DOCUMENT_ID_MAP_TABLE],
        db[SUMMARIES_TABLE],
      ],
      async () => {
        await recordDocumentIdMapping(oldId, nextId);

        const pdf = await db[PDF_TABLE].get(oldId);
        if (pdf) {
          const existing = await db[PDF_TABLE].get(nextId);
          if (existing) {
            const merged: PDFDocument = {
              ...pdf,
              ...existing,
              id: nextId,
              folderId: existing.folderId ?? pdf.folderId,
              name: existing.name || pdf.name,
            };
            await db[PDF_TABLE].put(merged);
            await db[PDF_TABLE].delete(oldId);
          } else {
            await db[PDF_TABLE].put({ ...pdf, id: nextId });
            await db[PDF_TABLE].delete(oldId);
          }
        }

        const epub = await db[EPUB_TABLE].get(oldId);
        if (epub) {
          const existing = await db[EPUB_TABLE].get(nextId);
          if (existing) {
            const merged: EPUBDocument = {
              ...epub,
              ...existing,
              id: nextId,
              folderId: existing.folderId ?? epub.folderId,
              name: existing.name || epub.name,
            };
            await db[EPUB_TABLE].put(merged);
            await db[EPUB_TABLE].delete(oldId);
          } else {
            await db[EPUB_TABLE].put({ ...epub, id: nextId });
            await db[EPUB_TABLE].delete(oldId);
          }
        }

        const html = await db[HTML_TABLE].get(oldId);
        if (html) {
          const existing = await db[HTML_TABLE].get(nextId);
          if (existing) {
            const merged: HTMLDocument = {
              ...html,
              ...existing,
              id: nextId,
              folderId: existing.folderId ?? html.folderId,
              name: existing.name || html.name,
            };
            await db[HTML_TABLE].put(merged);
            await db[HTML_TABLE].delete(oldId);
          } else {
            await db[HTML_TABLE].put({ ...html, id: nextId });
            await db[HTML_TABLE].delete(oldId);
          }
        }

        const oldLocation = await db[LAST_LOCATION_TABLE].get(oldId);
        if (oldLocation) {
          const newLocation = await db[LAST_LOCATION_TABLE].get(nextId);
          if (!newLocation) {
            await db[LAST_LOCATION_TABLE].put({ docId: nextId, location: oldLocation.location });
          }
          await db[LAST_LOCATION_TABLE].delete(oldId);
        }

        const appConfig = await db[APP_CONFIG_TABLE].get('singleton');
        if (appConfig?.documentListState) {
          const mapped = rewriteDocumentListStateDocIds(appConfig.documentListState, new Map([[oldId, nextId]]));
          if (mapped !== appConfig.documentListState) {
            await db[APP_CONFIG_TABLE].update('singleton', { documentListState: mapped });
          }
        }

        // Remap summaries to use the new document ID
        const oldSummaries = await db[SUMMARIES_TABLE].where('docId').equals(oldId).toArray();
        for (const summary of oldSummaries) {
          const newSummaryId = `${nextId}-${summary.scope}-${summary.pageNumber ?? 'all'}`;
          // Check if a summary with the new ID already exists
          const existing = await db[SUMMARIES_TABLE].get(newSummaryId);
          if (!existing) {
            // Create new summary with updated docId and id
            await db[SUMMARIES_TABLE].put({
              ...summary,
              id: newSummaryId,
              docId: nextId,
            });
          }
          // Delete the old summary
          await db[SUMMARIES_TABLE].delete(summary.id);
        }
      },
    );
  });
}

export async function migrateLegacyDexieDocumentIdsToSha(): Promise<Array<{ oldId: string; id: string }>> {
  return withDB(async () => {
    const mappings: Array<{ oldId: string; id: string }> = [];

    const pdfDocs = await db[PDF_TABLE].toArray();
    for (const doc of pdfDocs) {
      if (isSha256HexId(doc.id)) continue;
      const id = await sha256HexFromBytes(new Uint8Array(doc.data));
      if (id !== doc.id) {
        mappings.push({ oldId: doc.id, id });
        await applyDocumentIdMapping(doc.id, id);
      }
    }

    const epubDocs = await db[EPUB_TABLE].toArray();
    for (const doc of epubDocs) {
      if (isSha256HexId(doc.id)) continue;
      const id = await sha256HexFromBytes(new Uint8Array(doc.data));
      if (id !== doc.id) {
        mappings.push({ oldId: doc.id, id });
        await applyDocumentIdMapping(doc.id, id);
      }
    }

    const htmlDocs = await db[HTML_TABLE].toArray();
    for (const doc of htmlDocs) {
      if (isSha256HexId(doc.id)) continue;
      const id = await sha256HexFromString(doc.data);
      if (id !== doc.id) {
        mappings.push({ oldId: doc.id, id });
        await applyDocumentIdMapping(doc.id, id);
      }
    }

    return mappings;
  });
}

export async function getDocumentIdMappings(): Promise<Array<{ oldId: string; id: string }>> {
  return withDB(async () => {
    const rows = await db[DOCUMENT_ID_MAP_TABLE].toArray();
    return rows.map((row) => ({ oldId: row.oldId, id: row.id }));
  });
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
    const resolved = await getMappedDocumentId(id);
    return db[PDF_TABLE].get(resolved);
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
    const resolved = await getMappedDocumentId(id);
    await db.transaction('readwrite', db[PDF_TABLE], db[LAST_LOCATION_TABLE], async () => {
      await db[PDF_TABLE].delete(resolved);
      await db[LAST_LOCATION_TABLE].delete(resolved);
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
    const resolved = await getMappedDocumentId(id);
    return db[EPUB_TABLE].get(resolved);
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
    const resolved = await getMappedDocumentId(id);
    await db.transaction('readwrite', db[EPUB_TABLE], db[LAST_LOCATION_TABLE], async () => {
      await db[EPUB_TABLE].delete(resolved);
      await db[LAST_LOCATION_TABLE].delete(resolved);
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
    const resolved = await getMappedDocumentId(id);
    return db[HTML_TABLE].get(resolved);
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
    const resolved = await getMappedDocumentId(id);
    await db[HTML_TABLE].delete(resolved);
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
    const resolved = await getMappedDocumentId(docId);
    const row = await db[LAST_LOCATION_TABLE].get(resolved);
    return row ? row.location : null;
  });
}

export async function setLastDocumentLocation(docId: string, location: string): Promise<void> {
  await withDB(async () => {
    const resolved = await getMappedDocumentId(docId);
    await db[LAST_LOCATION_TABLE].put({ docId: resolved, location });
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

  const payload = (await response.json().catch(() => null)) as
    | { stored?: Array<{ oldId: string; id: string }> }
    | null;
  const stored = payload?.stored ?? [];
  for (const mapping of stored) {
    if (!mapping || typeof mapping.oldId !== 'string' || typeof mapping.id !== 'string') continue;
    if (mapping.oldId === mapping.id) continue;
    await applyDocumentIdMapping(mapping.oldId, mapping.id);
  }

  if (onProgress) {
    onProgress(100, 'Upload complete!');
  }

  return { lastSync: Date.now() };
}

export async function syncSelectedDocumentsToServer(
  documents: BaseDocument[],
  onProgress?: (progress: number, status?: string) => void,
  signal?: AbortSignal,
): Promise<{ lastSync: number }> {
    // Re-use logic from syncDocumentsToServer but only for specific documents
    // Actually, syncDocumentsToServer fetches all docs from DB.
    // We need to fetch the *full content* of the selected docs from DB.
    
    const fullDocs: SyncedDocument[] = [];
    let processed = 0;
    
    for (const doc of documents) {
        if (doc.type === 'pdf') {
            const data = await getPdfDocument(doc.id);
            if (data) fullDocs.push({ ...data, type: 'pdf', data: Array.from(new Uint8Array(data.data)) });
        } else if (doc.type === 'epub') {
            const data = await getEpubDocument(doc.id);
            if (data) fullDocs.push({ ...data, type: 'epub', data: Array.from(new Uint8Array(data.data)) });
        } else {
            const data = await getHtmlDocument(doc.id);
            if (data) {
                const encoder = new TextEncoder();
                fullDocs.push({ ...data, type: 'html', data: Array.from(encoder.encode(data.data)) });
            }
        }
        processed++;
        if (onProgress) onProgress((processed / documents.length) * 50, `Preparing ${processed}/${documents.length}...`);
    }
    
    if (onProgress) onProgress(50, 'Uploading to server...');

  const response = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: fullDocs }),
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to sync documents to server');
  }

  const payload = (await response.json().catch(() => null)) as
    | { stored?: Array<{ oldId: string; id: string }> }
    | null;
  const stored = payload?.stored ?? [];
  for (const mapping of stored) {
    if (!mapping || typeof mapping.oldId !== 'string' || typeof mapping.id !== 'string') continue;
    if (mapping.oldId === mapping.id) continue;
    await applyDocumentIdMapping(mapping.oldId, mapping.id);
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

  await saveSyncedDocumentsLocally(documents, onProgress);

  if (onProgress) {
    onProgress(100, 'Load complete!');
  }

  return { lastSync: Date.now() };
}

export async function loadSelectedDocumentsFromServer(
  selectedIds: string[],
  onProgress?: (progress: number, status?: string) => void,
  signal?: AbortSignal,
): Promise<{ lastSync: number }> {
  if (onProgress) {
    onProgress(10, 'Starting download...');
  }
  
  // Use new filtered API
  const idsParam = selectedIds.join(',');
  const response = await fetch(`/api/documents?ids=${encodeURIComponent(idsParam)}`, { signal });
  
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

  await saveSyncedDocumentsLocally(documents, onProgress);

  if (onProgress) {
    onProgress(100, 'Load complete!');
  }

  return { lastSync: Date.now() };
}

async function saveSyncedDocumentsLocally(documents: SyncedDocument[], onProgress?: (progress: number, status?: string) => void) {
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
}


export async function importSelectedDocuments(
  documents: BaseDocument[],
  onProgress?: (progress: number, status?: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (documents.length === 0) return;

  const textDecoder = new TextDecoder();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];

    if (onProgress) {
      onProgress(10 + (i / documents.length) * 85, `Downloading ${i + 1}/${documents.length}: ${doc.name}`);
    }

    const contentResponse = await fetch(`/api/documents/library/content?id=${encodeURIComponent(doc.id)}`, { signal });
    if (!contentResponse.ok) {
      console.warn(`Failed to download library document: ${doc.name}`);
      continue;
    }

    const buffer = await contentResponse.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (doc.type === 'pdf') {
      const localId = await sha256HexFromBytes(bytes);
      await addPdfDocument({
        id: localId,
        type: 'pdf',
        name: doc.name,
        size: bytes.byteLength,
        lastModified: doc.lastModified,
        data: buffer,
      });
    } else if (doc.type === 'epub') {
      const localId = await sha256HexFromBytes(bytes);
      await addEpubDocument({
        id: localId,
        type: 'epub',
        name: doc.name,
        size: bytes.byteLength,
        lastModified: doc.lastModified,
        data: buffer,
      });
    } else {
      const decoded = textDecoder.decode(bytes);
      const localId = await sha256HexFromString(decoded);
      await addHtmlDocument({
        id: localId,
        type: 'html',
        name: doc.name,
        size: bytes.byteLength,
        lastModified: doc.lastModified,
        data: decoded,
      });
    }

    if (onProgress) {
      onProgress(10 + ((i + 1) / documents.length) * 85, `Imported ${i + 1}/${documents.length}`);
    }
  }
}

export async function importDocumentsFromLibrary(
  onProgress?: (progress: number, status?: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (onProgress) {
    onProgress(5, 'Scanning server library...');
  }

  const listResponse = await fetch('/api/documents/library', { signal });
  if (!listResponse.ok) {
    throw new Error('Failed to list library documents');
  }

  const { documents } = (await listResponse.json()) as { documents: BaseDocument[] };

  if (documents.length === 0) {
    if (onProgress) {
      onProgress(100, 'No documents found in server library');
    }
    return;
  }

  if (onProgress) {
    onProgress(10, `Found ${documents.length} documents. Importing...`);
  }

  await importSelectedDocuments(documents, onProgress, signal);

  if (onProgress) {
    onProgress(100, 'Library import complete!');
  }
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
  _docType: 'pdf' | 'epub' | 'html',
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
