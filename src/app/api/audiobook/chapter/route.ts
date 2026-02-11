import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { audiobooks, audiobookChapters } from '@/db/schema';
import { requireAuthContext } from '@/lib/server/auth';
import {
  deleteAudiobookObject,
  getAudiobookObjectBuffer,
  isMissingBlobError,
  listAudiobookObjects,
} from '@/lib/server/audiobooks-blobstore';
import { decodeChapterFileName } from '@/lib/server/audiobook';
import { isS3Configured } from '@/lib/server/s3';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';

export const dynamic = 'force-dynamic';

function s3NotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Audiobooks storage is not configured. Set S3_* environment variables.' },
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

function findChapterFileNameByIndex(fileNames: string[], index: number): { fileName: string; title: string; format: 'mp3' | 'm4b' } | null {
  const matches = fileNames
    .map((fileName) => {
      const decoded = decodeChapterFileName(fileName);
      if (!decoded) return null;
      if (decoded.index !== index) return null;
      return { fileName, title: decoded.title, format: decoded.format };
    })
    .filter((value): value is { fileName: string; title: string; format: 'mp3' | 'm4b' } => Boolean(value))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

  return matches.at(-1) ?? null;
}

export async function GET(request: NextRequest) {
  try {
    if (!isS3Configured()) return s3NotConfiguredResponse();

    const bookId = request.nextUrl.searchParams.get('bookId');
    const chapterIndexStr = request.nextUrl.searchParams.get('chapterIndex');

    if (!bookId || !chapterIndexStr) {
      return NextResponse.json({ error: 'Missing bookId or chapterIndex parameter' }, { status: 400 });
    }

    const chapterIndex = Number.parseInt(chapterIndexStr, 10);
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      return NextResponse.json({ error: 'Invalid chapterIndex parameter' }, { status: 400 });
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const { userId, authEnabled } = ctxOrRes;
    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);
    const storageUserId = userId ?? unclaimedUserId;
    const allowedUserIds = authEnabled ? [storageUserId, unclaimedUserId] : [unclaimedUserId];

    const [existingBook] = await db
      .select({ userId: audiobooks.userId })
      .from(audiobooks)
      .where(and(eq(audiobooks.id, bookId), inArray(audiobooks.userId, allowedUserIds)));

    if (!existingBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const objects = await listAudiobookObjects(bookId, existingBook.userId, testNamespace);
    const chapter = findChapterFileNameByIndex(
      objects.map((object) => object.fileName),
      chapterIndex,
    );

    if (!chapter) {
      await db
        .delete(audiobookChapters)
        .where(
          and(
            eq(audiobookChapters.bookId, bookId),
            eq(audiobookChapters.userId, existingBook.userId),
            eq(audiobookChapters.chapterIndex, chapterIndex),
          ),
        );
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    let buffer: Buffer;
    try {
      buffer = await getAudiobookObjectBuffer(bookId, existingBook.userId, chapter.fileName, testNamespace);
    } catch (error) {
      if (isMissingBlobError(error)) {
        await db
          .delete(audiobookChapters)
          .where(
            and(
              eq(audiobookChapters.bookId, bookId),
              eq(audiobookChapters.userId, existingBook.userId),
              eq(audiobookChapters.chapterIndex, chapterIndex),
            ),
          );
        return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
      }
      throw error;
    }

    const mimeType = chapter.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    const sanitizedTitle = chapter.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    return new NextResponse(streamBuffer(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${sanitizedTitle}.${chapter.format}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error downloading chapter:', error);
    return NextResponse.json({ error: 'Failed to download chapter' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isS3Configured()) return s3NotConfiguredResponse();

    const bookId = request.nextUrl.searchParams.get('bookId');
    const chapterIndexStr = request.nextUrl.searchParams.get('chapterIndex');

    if (!bookId || !chapterIndexStr) {
      return NextResponse.json({ error: 'Missing bookId or chapterIndex parameter' }, { status: 400 });
    }

    const chapterIndex = Number.parseInt(chapterIndexStr, 10);
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      return NextResponse.json({ error: 'Invalid chapterIndex parameter' }, { status: 400 });
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const storageUserId = ctxOrRes.userId ?? getUnclaimedUserIdForNamespace(testNamespace);

    const [existingBook] = await db
      .select({ userId: audiobooks.userId })
      .from(audiobooks)
      .where(and(eq(audiobooks.id, bookId), eq(audiobooks.userId, storageUserId)));

    if (!existingBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    await db
      .delete(audiobookChapters)
      .where(
        and(
          eq(audiobookChapters.bookId, bookId),
          eq(audiobookChapters.userId, storageUserId),
          eq(audiobookChapters.chapterIndex, chapterIndex),
        ),
      );

    const objectNames = (await listAudiobookObjects(bookId, storageUserId, testNamespace)).map((object) => object.fileName);
    const chapterPrefix = `${String(chapterIndex + 1).padStart(4, '0')}__`;

    for (const fileName of objectNames) {
      if (!fileName.startsWith(chapterPrefix)) continue;
      if (!fileName.endsWith('.mp3') && !fileName.endsWith('.m4b')) continue;
      await deleteAudiobookObject(bookId, storageUserId, fileName, testNamespace).catch(() => {});
    }

    await deleteAudiobookObject(bookId, storageUserId, 'complete.mp3', testNamespace).catch(() => {});
    await deleteAudiobookObject(bookId, storageUserId, 'complete.m4b', testNamespace).catch(() => {});
    await deleteAudiobookObject(bookId, storageUserId, 'complete.mp3.manifest.json', testNamespace).catch(() => {});
    await deleteAudiobookObject(bookId, storageUserId, 'complete.m4b.manifest.json', testNamespace).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 });
  }
}
