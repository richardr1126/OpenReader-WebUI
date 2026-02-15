import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { requireAuthContext } from '@/lib/server/auth';
import { isValidDocumentId } from '@/lib/server/documents-blobstore';
import { presignDocumentPreviewGet } from '@/lib/server/document-previews-blobstore';
import { ensureDocumentPreview, isPreviewableDocumentType } from '@/lib/server/document-previews';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';
import { isS3Configured } from '@/lib/server/s3';
import { validatePreviewRequest } from '../utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const validation = await validatePreviewRequest(req);
    if (validation.errorResponse) return validation.errorResponse;
    const { doc, testNamespace, id } = validation;

    const presignUrl = `/api/documents/blob/preview/presign?id=${encodeURIComponent(id)}`;
    const fallbackUrl = `/api/documents/blob/preview/fallback?id=${encodeURIComponent(id)}`;
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

    const directUrl = await presignDocumentPreviewGet(doc.id, testNamespace).catch(() => null);
    return NextResponse.json(
      {
        status: 'ready',
        presignUrl,
        fallbackUrl,
        ...(directUrl ? { directUrl } : {}),
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('Error ensuring document preview:', error);
    return NextResponse.json({ error: 'Failed to ensure document preview' }, { status: 500 });
  }
}
