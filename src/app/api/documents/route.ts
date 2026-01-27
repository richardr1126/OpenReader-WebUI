import { createHash } from 'crypto';
import { readFile, stat, unlink, utimes, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { DOCUMENTS_V1_DIR, isDocumentsV1Ready, scanDocumentsFS } from '@/lib/server/docstore';
import type { BaseDocument, DocumentType, SyncedDocument } from '@/types/documents';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { eq, or, and, inArray, count } from 'drizzle-orm';
import { isAuthEnabled } from '@/lib/server/auth-config';
import { requireAuthContext } from '@/lib/server/auth';

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

export async function POST(req: NextRequest) {
  try {
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const userId = ctxOrRes.userId;

    const data = await req.json();
    const documentsData = data.documents as SyncedDocument[];
    const stored: Array<{ oldId: string; id: string; name: string }> = [];

    // Ensure directory exists (redundant with isDocumentsV1Ready but safe)
    // const SYNC_DIR = DOCUMENTS_V1_DIR; 

    for (const doc of documentsData) {
      const content = Buffer.from(new Uint8Array(doc.data));
      const id = createHash('sha256').update(content).digest('hex');

      const baseName = path.basename(doc.name || `${id}.${doc.type}`);
      const safeName = baseName.replaceAll('\u0000', '').slice(0, 240) || `${id}.${doc.type}`;

      const targetFileName = `${id}__${encodeURIComponent(safeName)}`;
      const targetPath = path.join(SYNC_DIR, targetFileName);

      // Write file if not exists
      try {
        await stat(targetPath);
      } catch {
        await writeFile(targetPath, content);
      }
      await trySetFileMtime(targetPath, doc.lastModified);

      // DB Upsert
      // With composite PK (id, userId), we check if THIS user already has this document
      if (isAuthEnabled() && db) {
        const [existing] = await db.select().from(documents).where(
          and(eq(documents.id, id), eq(documents.userId, userId))
        );

        if (!existing) {
          await db.insert(documents).values({
            id,
            userId,
            name: safeName,
            type: doc.type,
            size: content.length,
            lastModified: doc.lastModified,
            filePath: targetFileName
          });
        }
      }

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

    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const userId = ctxOrRes.userId;

    const url = new URL(req.url);
    const list = url.searchParams.get('list') === 'true';
    const format = url.searchParams.get('format');
    const idsParam = url.searchParams.get('ids');

    // If list=true, force metadata only.
    // If format=metadata, force metadata only.
    // Otherwise include data.
    const includeData = !list && format !== 'metadata';

    const targetIds = idsParam ? idsParam.split(',').filter(Boolean) : null;

    // Query database (or filesystem) for documents the user is allowed to access
    let allowedDocs: { id: string; name: string; type: string; size: number; lastModified: number; filePath: string }[] = [];

    if (!isAuthEnabled()) {
      const fsDocs = await scanDocumentsFS();
      allowedDocs = fsDocs.map(d => ({ ...d }));
      if (targetIds) {
        allowedDocs = allowedDocs.filter(d => targetIds!.includes(d.id));
      }
    } else {
      if (!db) throw new Error("DB not initialized");
      const rows = await db.select().from(documents).where(
        and(
          or(eq(documents.userId, userId), eq(documents.userId, 'unclaimed')),
          targetIds ? inArray(documents.id, targetIds) : undefined
        )
      );
      allowedDocs = rows as unknown as { id: string; name: string; type: string; size: number; lastModified: number; filePath: string }[];
    }

    const results: (BaseDocument | SyncedDocument)[] = [];

    for (const doc of allowedDocs) {
      const type: DocumentType =
        doc.type === 'pdf' || doc.type === 'epub' || doc.type === 'docx' || doc.type === 'html'
          ? (doc.type as DocumentType)
          : toDocumentTypeFromName(doc.name);

      const metadata: BaseDocument = {
        id: doc.id!,
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        type,
      };

      if (!includeData) {
        results.push(metadata);
        continue;
      }

      try {
        const filePath = path.join(SYNC_DIR, doc.filePath);
        const content = await readFile(filePath);
        results.push({
          ...metadata,
          data: Array.from(new Uint8Array(content)),
        });
      } catch (err) {
        console.warn(`Failed to read content for document ${doc.id} at ${doc.filePath}`, err);
        // Skip adding data if file is missing, or just skip item? 
        // Best to skip item to avoid client errors on partial data
      }
    }

    return NextResponse.json({ documents: results });
  } catch (error) {
    console.error('Error loading documents:', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}


export async function DELETE(req: NextRequest) {
  try {
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    // Auth check - require session
    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const userId = ctxOrRes.userId;

    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids');

    // Determine which IDs to try to delete
    let targetIds: string[] = [];

    if (idsParam) {
      targetIds = idsParam.split(',').filter(Boolean);
    } else {
      if (!isAuthEnabled()) {
        const fsDocs = await scanDocumentsFS();
        targetIds = fsDocs.map((d) => d.id);
      } else {
        // Existing behavior was "nuke everything"; keep it scoped to "my" docs.
        if (!db) throw new Error("DB not initialized");
        const userDocs = await db.select({ id: documents.id }).from(documents).where(eq(documents.userId, userId as string));
        targetIds = userDocs.map((d: { id: string | null }) => d.id!).filter(Boolean) as string[];
      }
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const deletedRows: { id: string; filePath: string }[] = [];

    if (!isAuthEnabled()) {
      // FS cleanup only
      // Since we don't track ownership, we just delete the files requested.
      // This implies in no-auth mode, any user can delete any file if they know the ID.
      const fsDocs = await scanDocumentsFS();
      for (const doc of fsDocs) {
        if (targetIds.includes(doc.id)) {
          deletedRows.push({ id: doc.id, filePath: doc.filePath });
        }
      }
    } else {
      if (!db) throw new Error("DB not initialized");
      const rows = await db.delete(documents)
        .where(and(
          eq(documents.userId, userId as string),
          inArray(documents.id, targetIds)
        ))
        .returning({ id: documents.id, filePath: documents.filePath });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.forEach((r: any) => deletedRows.push({ id: r.id!, filePath: r.filePath }));
    }

    // If driver doesn't support returning (e.g. older SQLite without properly configured returning), we might fallback.
    // But Drizzle usually handles this.

    let deletedCount = 0;

    for (const row of deletedRows) {
      deletedCount++;
      // Chech reference count for this ID
      // If 0 remaining, delete file
      let refCount = 0;
      if (isAuthEnabled() && db) {
        const [ref] = await db.select({ count: count() }).from(documents).where(eq(documents.id, row.id!));
        refCount = ref?.count ?? 0;
      }

      if (refCount === 0) {
        const filePath = path.join(SYNC_DIR, row.filePath);
        try {
          await unlink(filePath);
        } catch {
          // Ignore if missing
        }
      }
    }

    return NextResponse.json({ success: true, deleted: deletedCount });

  } catch (error) {
    console.error('Error deleting documents:', error);
    return NextResponse.json({ error: 'Failed to delete documents' }, { status: 500 });
  }
}
