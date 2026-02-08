import { open, readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { ensureDocumentsV1Ready, isDocumentsV1Ready, DOCUMENTS_V1_DIR } from '@/lib/server/docstore';
import { requireAuthContext } from '@/lib/server/auth';
import { ensureDbIndexed } from '@/lib/server/db-indexing';
import { contentTypeForName } from '@/lib/server/library';
import { extractRawTextSnippet } from '@/lib/text-snippets';
import { isEnoent } from '@/lib/server/documents-utils';
import { applyOpenReaderTestNamespacePath, getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';

export const dynamic = 'force-dynamic';

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

async function readHeadBuffer(filePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const result = await handle.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
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
    const documentsDir = applyOpenReaderTestNamespacePath(DOCUMENTS_V1_DIR, testNamespace);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);

    const storageUserId = ctxOrRes.userId ?? unclaimedUserId;
    const allowedUserIds = ctxOrRes.authEnabled ? [storageUserId, unclaimedUserId] : [unclaimedUserId];

    await ensureDbIndexed();

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const format = (url.searchParams.get('format') || '').toLowerCase().trim();
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const docs = await db
      .select({ id: documents.id, userId: documents.userId, name: documents.name, filePath: documents.filePath })
      .from(documents)
      .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = docs.find((d: any) => d.userId === storageUserId) ?? docs[0];

    if (!doc?.filePath) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const filePath = path.join(documentsDir, doc.filePath);
    const filename = doc.name || doc.filePath;

    if (format === 'snippet') {
      const maxChars = clampInt(Number.parseInt(url.searchParams.get('maxChars') || '1600', 10), 100, 8000);
      const maxBytes = clampInt(Number.parseInt(url.searchParams.get('maxBytes') || '131072', 10), 4096, 1024 * 1024);

      try {
        const head = await readHeadBuffer(filePath, maxBytes);
        const decoded = new TextDecoder().decode(new Uint8Array(head));
        const snippet = extractRawTextSnippet(decoded, maxChars);
        return NextResponse.json(
          { snippet },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      } catch (error) {
        if (isEnoent(error)) {
          await db
            .delete(documents)
            .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)));
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        throw error;
      }
    }

    let content: ArrayBuffer;
    try {
      const buf = await readFile(filePath);
      content = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch (error) {
      if (isEnoent(error)) {
        // The DB can become stale if a file is deleted manually from the docstore.
        // Prune rows so the client stops showing ghost documents.
        await db
          .delete(documents)
          .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)));
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      throw error;
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentTypeForName(filename),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error loading document content:', error);
    return NextResponse.json({ error: 'Failed to load document content' }, { status: 500 });
  }
}
