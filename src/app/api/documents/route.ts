import { createHash } from 'crypto';
import { readdir, readFile, stat, unlink, utimes, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { DOCUMENTS_V1_DIR, isDocumentsV1Ready } from '@/lib/server/docstore';
import type { BaseDocument, DocumentType, SyncedDocument } from '@/types/documents';

export const dynamic = 'force-dynamic';

const SYNC_DIR = DOCUMENTS_V1_DIR;

async function trySetFileMtime(filePath: string, lastModifiedMs: number): Promise<void> {
  if (!Number.isFinite(lastModifiedMs)) return;
  const mtime = new Date(lastModifiedMs);
  if (Number.isNaN(mtime.getTime())) return;

  try {
    await utimes(filePath, mtime, mtime);
  } catch (error) {
    console.warn('Failed to set document mtime:', filePath, error);
  }
}

function toDocumentTypeFromName(name: string): DocumentType {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.epub') return 'epub';
  if (ext === '.docx') return 'docx';
  return 'html';
}

function parseSyncedFileName(fileName: string): { id: string; name: string } | null {
  const match = /^([a-f0-9]{64})__(.+)$/i.exec(fileName);
  if (!match) return null;
  try {
    return { id: match[1].toLowerCase(), name: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

async function loadSyncedDocuments(includeData: boolean, targetIds?: Set<string>): Promise<(BaseDocument | SyncedDocument)[]> {
  const results: (BaseDocument | SyncedDocument)[] = [];
  let files: string[] = [];

  try {
    files = await readdir(SYNC_DIR);
  } catch {
    return results;
  }

  for (const file of files) {
    const parsed = parseSyncedFileName(file);
    if (!parsed) continue;

    // Filter by ID if specific IDs are requested
    if (targetIds && !targetIds.has(parsed.id)) continue;

    const filePath = path.join(SYNC_DIR, file);
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      continue;
    }

    if (!fileStat.isFile()) continue;

    const type = toDocumentTypeFromName(parsed.name);
    const metadata: BaseDocument = {
      id: parsed.id,
      name: parsed.name,
      size: fileStat.size,
      lastModified: fileStat.mtimeMs,
      type,
    };

    if (!includeData) {
      results.push(metadata);
      continue;
    }

    const content = await readFile(filePath);
    results.push({
      ...metadata,
      data: Array.from(new Uint8Array(content)),
    });
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }
    const data = await req.json();
    const documents = data.documents as SyncedDocument[];

    let existingFiles: string[] = [];
    try {
      existingFiles = await readdir(SYNC_DIR);
    } catch {
      existingFiles = [];
    }

    const existingById = new Map<string, string>();
    for (const file of existingFiles) {
      const parsed = parseSyncedFileName(file);
      if (!parsed) continue;
      if (!existingById.has(parsed.id)) {
        existingById.set(parsed.id, file);
      }
    }

    const stored: Array<{ oldId: string; id: string; name: string }> = [];

    for (const doc of documents) {
      const content = Buffer.from(new Uint8Array(doc.data));
      const id = createHash('sha256').update(content).digest('hex');

      const baseName = path.basename(doc.name || `${id}.${doc.type}`);
      const safeName = baseName.replaceAll('\u0000', '').slice(0, 240) || `${id}.${doc.type}`;

      const existingFile = existingById.get(id);
      const targetFileName = existingFile ?? `${id}__${encodeURIComponent(safeName)}`;
      const targetPath = path.join(SYNC_DIR, targetFileName);

      if (!existingFile) {
        await writeFile(targetPath, content);
        existingById.set(id, targetFileName);
      }

      await trySetFileMtime(targetPath, doc.lastModified);

      stored.push({ oldId: doc.id, id, name: safeName });
    }

    return NextResponse.json({ success: true, stored });
  } catch (error) {
    console.error('Error saving documents:', error);
    return NextResponse.json({ error: 'Failed to save documents' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const url = new URL(req.url);
    const list = url.searchParams.get('list') === 'true';
    const format = url.searchParams.get('format');
    const idsParam = url.searchParams.get('ids');

    // If list=true, force metadata only.
    // If format=metadata, force metadata only.
    // Otherwise include data.
    const includeData = !list && format !== 'metadata';
    
    let targetIds: Set<string> | undefined;
    if (idsParam) {
        targetIds = new Set(idsParam.split(',').filter(Boolean));
    }

    const documents = await loadSyncedDocuments(includeData, targetIds);

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error loading documents:', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    // Delete synced docs (new format) safely without touching unrelated docstore data.
    let syncFiles: string[] = [];
    try {
      syncFiles = await readdir(SYNC_DIR);
    } catch {
      syncFiles = [];
    }

    for (const file of syncFiles) {
      const filePath = path.join(SYNC_DIR, file);
      try {
        const st = await stat(filePath);
        if (st.isFile()) {
          await unlink(filePath);
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting documents:', error);
    return NextResponse.json({ error: 'Failed to delete documents' }, { status: 500 });
  }
}
