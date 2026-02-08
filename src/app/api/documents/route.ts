import { createHash } from 'crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { DOCUMENTS_V1_DIR, ensureDocumentsV1Ready, isDocumentsV1Ready } from '@/lib/server/docstore';
import type { BaseDocument, DocumentType, SyncedDocument } from '@/types/documents';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';
import { requireAuthContext } from '@/lib/server/auth';
import { ensureDbIndexed } from '@/lib/server/db-indexing';
import { isEnoent, toDocumentTypeFromName, trySetFileMtime } from '@/lib/server/documents-utils';
import { applyOpenReaderTestNamespacePath, getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDocumentsV1Ready();
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const testNamespace = getOpenReaderTestNamespace(req.headers);
    const syncDir = applyOpenReaderTestNamespacePath(DOCUMENTS_V1_DIR, testNamespace);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);
    await mkdir(syncDir, { recursive: true });

    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const storageUserId = ctxOrRes.userId ?? unclaimedUserId;

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
      const targetPath = path.join(syncDir, targetFileName);

      // Write file if not exists
      try {
        await stat(targetPath);
      } catch {
        await writeFile(targetPath, content);
      }
      await trySetFileMtime(targetPath, doc.lastModified);

      // DB Upsert
      // With composite PK (id, userId), we check if THIS user already has this document
      await db
        .insert(documents)
        .values({
          id,
          userId: storageUserId,
          name: safeName,
          type: doc.type,
          size: content.length,
          lastModified: doc.lastModified,
          filePath: targetFileName,
        })
        .onConflictDoNothing();

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
    await ensureDocumentsV1Ready();
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const testNamespace = getOpenReaderTestNamespace(req.headers);
    const syncDir = applyOpenReaderTestNamespacePath(DOCUMENTS_V1_DIR, testNamespace);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);

    const storageUserId = ctxOrRes.userId ?? unclaimedUserId;
    const allowedUserIds = ctxOrRes.authEnabled ? [storageUserId, unclaimedUserId] : [unclaimedUserId];

    await ensureDbIndexed();

    const url = new URL(req.url);
    const list = url.searchParams.get('list') === 'true';
    const format = url.searchParams.get('format');
    const idsParam = url.searchParams.get('ids');

    // If list=true, force metadata only.
    // If format=metadata, force metadata only.
    // Otherwise include data.
    const includeData = !list && format !== 'metadata';

    const targetIds = idsParam ? idsParam.split(',').filter(Boolean) : null;

    // Query database for documents the user is allowed to access
    let allowedDocs: { id: string; userId: string; name: string; type: string; size: number; lastModified: number; filePath: string }[] = [];

    const conditions = [
      inArray(documents.userId, allowedUserIds),
      ...(targetIds ? [inArray(documents.id, targetIds)] : []),
    ];
    const rows = await db.select().from(documents).where(and(...conditions));
    allowedDocs = rows as unknown as { id: string; userId: string; name: string; type: string; size: number; lastModified: number; filePath: string }[];

    const results: (BaseDocument | SyncedDocument)[] = [];

    for (const doc of allowedDocs) {
      const type: DocumentType =
        doc.type === 'pdf' || doc.type === 'epub' || doc.type === 'docx' || doc.type === 'html'
          ? (doc.type as DocumentType)
          : toDocumentTypeFromName(doc.name);

      // If the underlying file was deleted manually, keep the API self-healing:
      // prune the DB row so clients stop listing ghost documents.
      const absolutePath = doc.filePath ? path.join(syncDir, doc.filePath) : '';
      if (!absolutePath || !existsSync(absolutePath)) {
        await db
          .delete(documents)
          .where(and(eq(documents.id, doc.id), eq(documents.userId, doc.userId)));
        continue;
      }

      const metadata: BaseDocument = {
        id: doc.id!,
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        type,
        scope: doc.userId === unclaimedUserId ? 'unclaimed' : 'user',
      };

      if (!includeData) {
        results.push(metadata);
        continue;
      }

      try {
        const content = await readFile(absolutePath);
        results.push({
          ...metadata,
          data: Array.from(new Uint8Array(content)),
        });
      } catch (err) {
        if (isEnoent(err)) {
          await db
            .delete(documents)
            .where(and(eq(documents.id, doc.id), eq(documents.userId, doc.userId)));
          continue;
        }
        console.warn(`Failed to read content for document ${doc.id} at ${doc.filePath}`, err);
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
    await ensureDocumentsV1Ready();
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    // Auth check - require session
    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const testNamespace = getOpenReaderTestNamespace(req.headers);
    const syncDir = applyOpenReaderTestNamespacePath(DOCUMENTS_V1_DIR, testNamespace);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);

    const storageUserId = ctxOrRes.userId ?? unclaimedUserId;

    await ensureDbIndexed();

    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids');
    const scopeParam = (url.searchParams.get('scope') || '').toLowerCase().trim();

    const wantsUnclaimed = scopeParam === 'unclaimed';
    const wantsUser = scopeParam === '' || scopeParam === 'user';

    if (!wantsUser && !wantsUnclaimed) {
      return NextResponse.json(
        { error: "Invalid scope. Expected 'user' (default) or 'unclaimed'." },
        { status: 400 },
      );
    }

    // Deleting the global unclaimed pool is a privileged operation when auth is enabled.
    if (ctxOrRes.authEnabled && wantsUnclaimed && ctxOrRes.user?.isAnonymous) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetUserIds = Array.from(
      new Set(
        [
          ...(wantsUser ? [storageUserId] : []),
          ...(wantsUnclaimed ? [unclaimedUserId] : []),
        ].filter(Boolean),
      ),
    );

    if (targetUserIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    // Determine which IDs to try to delete
    let targetIds: string[] = [];

    if (idsParam) {
      targetIds = idsParam.split(',').filter(Boolean);
    } else {
      // Existing behavior was "nuke everything"; keep it scoped to the selected user buckets.
      const rows = await db
        .select({ id: documents.id })
        .from(documents)
        .where(inArray(documents.userId, targetUserIds));
      targetIds = rows.map((d: { id: string | null }) => d.id!).filter(Boolean) as string[];
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const deletedRows: { id: string; filePath: string }[] = [];

    const rows = await db
      .delete(documents)
      .where(and(inArray(documents.userId, targetUserIds), inArray(documents.id, targetIds)))
      .returning({ id: documents.id, filePath: documents.filePath });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.forEach((r: any) => deletedRows.push({ id: r.id!, filePath: r.filePath }));

    // If driver doesn't support returning (e.g. older SQLite without properly configured returning), we might fallback.
    // But Drizzle usually handles this.

    let deletedCount = 0;

    for (const row of deletedRows) {
      deletedCount++;
      // Chech reference count for this ID
      // If 0 remaining, delete file
      let refCount = 0;
      const [ref] = await db.select({ count: count() }).from(documents).where(eq(documents.id, row.id!));
      refCount = Number(ref?.count ?? 0);

      if (refCount === 0) {
        const filePath = path.join(syncDir, row.filePath);
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
