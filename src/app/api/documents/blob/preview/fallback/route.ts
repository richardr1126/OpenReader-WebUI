import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { requireAuthContext } from '@/lib/server/auth';
import { isValidDocumentId } from '@/lib/server/documents-blobstore';
import {
  getDocumentPreviewBuffer,
  isMissingBlobError,
} from '@/lib/server/document-previews-blobstore';
import {
  ensureDocumentPreview,
  enqueueDocumentPreview,
  isPreviewableDocumentType,
} from '@/lib/server/document-previews';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';
import { isS3Configured } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

function s3NotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Documents storage is not configured. Set S3_* environment variables.' },
    { status: 503 },
  );
}

function streamBuffer(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
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
    const presignUrl = `/api/documents/blob/preview/presign?id=${encodeURIComponent(id)}`;
    const fallbackUrl = `/api/documents/blob/preview/fallback?id=${encodeURIComponent(id)}`;
    if (!isValidDocumentId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const rows = (await db
      .select({
        id: documents.id,
        userId: documents.userId,
        type: documents.type,
        lastModified: documents.lastModified,
      })
      .from(documents)
      .where(and(eq(documents.id, id), inArray(documents.userId, allowedUserIds)))) as Array<{
      id: string;
      userId: string;
      type: string;
      lastModified: number;
    }>;

    const doc = rows.find((row) => row.userId === storageUserId) ?? rows[0];
    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!isPreviewableDocumentType(doc.type)) {
      return NextResponse.json({ error: `Preview not supported for type ${doc.type}` }, { status: 415 });
    }

    const preview = await ensureDocumentPreview(
      {
        id: doc.id,
        type: doc.type,
        lastModified: Number(doc.lastModified),
      },
      testNamespace,
    );

    if (preview.state !== 'ready') {
      return NextResponse.json(
        {
          status: preview.status,
          retryAfterMs: preview.retryAfterMs,
          presignUrl,
          fallbackUrl,
        },
        {
          status: 202,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    try {
      const content = await getDocumentPreviewBuffer(doc.id, testNamespace);
      return new NextResponse(streamBuffer(content), {
        headers: {
          'Content-Type': preview.contentType,
          'Cache-Control': 'no-store',
          'Content-Length': String(content.byteLength),
        },
      });
    } catch (error) {
      if (isMissingBlobError(error)) {
        await enqueueDocumentPreview(
          {
            id: doc.id,
            type: doc.type,
            lastModified: Number(doc.lastModified),
          },
          testNamespace,
        ).catch(() => {});
        return NextResponse.json(
          {
            status: 'queued',
            retryAfterMs: 1500,
            presignUrl,
            fallbackUrl,
          },
          {
            status: 202,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading document preview fallback:', error);
    return NextResponse.json({ error: 'Failed to load document preview' }, { status: 500 });
  }
}
