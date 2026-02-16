import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { requireAuthContext } from '@/lib/server/auth';
import { contentTypeForName } from '@/lib/server/library';
import { extractRawTextSnippet } from '@/lib/text-snippets';
import {
  getDocumentBlob,
  getDocumentRange,
  isMissingBlobError,
  isValidDocumentId,
  presignGet,
} from '@/lib/server/documents-blobstore';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';
import { isS3Configured } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function s3NotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Documents storage is not configured. Set S3_* environment variables.' },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  try {
    if (!isS3Configured()) return s3NotConfiguredResponse();

    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const testNamespace = getOpenReaderTestNamespace(req.headers);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);
    const storageUserId = ctxOrRes.userId ?? unclaimedUserId;
    const allowedUserIds = ctxOrRes.authEnabled ? [storageUserId, unclaimedUserId] : [unclaimedUserId];

    const url = new URL(req.url);
    const id = (url.searchParams.get('id') || '').trim().toLowerCase();
    const format = (url.searchParams.get('format') || '').toLowerCase().trim();
    const prefersProxy = (url.searchParams.get('proxy') || '').trim() === '1';
    if (!isValidDocumentId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const rows = (await db
      .select({ id: documents.id, userId: documents.userId, name: documents.name, filePath: documents.filePath })
      .from(documents)
      .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)))) as Array<{
      id: string;
      userId: string;
      name: string;
      filePath: string;
    }>;

    const doc = rows.find((row) => row.userId === storageUserId) ?? rows[0];
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const filename = doc.name || `${id}.bin`;
    const responseType = contentTypeForName(filename);

    if (format === 'snippet') {
      const maxChars = clampInt(Number.parseInt(url.searchParams.get('maxChars') || '1600', 10), 100, 8000);
      const maxBytes = clampInt(Number.parseInt(url.searchParams.get('maxBytes') || '131072', 10), 4096, 1024 * 1024);
      try {
        const head = await getDocumentRange(id, 0, maxBytes - 1, testNamespace);
        const decoded = new TextDecoder().decode(new Uint8Array(head));
        const snippet = extractRawTextSnippet(decoded, maxChars);
        return NextResponse.json(
          { snippet },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      } catch (error) {
        if (isMissingBlobError(error)) {
          await db
            .delete(documents)
            .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)));
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        throw error;
      }
    }

    try {
      if (!prefersProxy) {
        const directUrl = await presignGet(id, testNamespace).catch(() => null);
        if (directUrl) {
          return NextResponse.redirect(directUrl, {
            status: 307,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
      }

      const content = await getDocumentBlob(id, testNamespace);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(content));
          controller.close();
        },
      });
      return new NextResponse(stream, {
        headers: {
          'Content-Type': responseType,
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      if (isMissingBlobError(error)) {
        await db
          .delete(documents)
          .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)));
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading document content:', error);
    return NextResponse.json({ error: 'Failed to load document content' }, { status: 500 });
  }
}
