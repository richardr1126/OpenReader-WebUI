import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { getAudiobooksRootDir, ensureAudiobooksV1Ready, isAudiobooksV1Ready } from '@/lib/server/docstore';
import { findStoredChapterByIndex } from '@/lib/server/audiobook';
import { db } from '@/db';
import { audiobooks, audiobookChapters } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { requireAuthContext } from '@/lib/server/auth';
import { ensureDbIndexed } from '@/lib/server/db-indexing';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';
import { pruneAudiobookChapterIfMissingFile, pruneAudiobookIfMissingDir } from '@/lib/server/audiobook-prune';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    const chapterIndexStr = request.nextUrl.searchParams.get('chapterIndex');

    if (!bookId || !chapterIndexStr) {
      return NextResponse.json(
        { error: 'Missing bookId or chapterIndex parameter' },
        { status: 400 }
      );
    }

    const chapterIndex = parseInt(chapterIndexStr);
    if (isNaN(chapterIndex)) {
      return NextResponse.json(
        { error: 'Invalid chapterIndex parameter' },
        { status: 400 }
      );
    }

    await ensureAudiobooksV1Ready();
    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const { userId, authEnabled } = ctxOrRes;
    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);
    const storageUserId = userId ?? unclaimedUserId;
    const allowedUserIds = authEnabled ? [storageUserId, unclaimedUserId] : [unclaimedUserId];

    await ensureDbIndexed();

    // Verify ownership with composite PK - allow access to user's own OR unclaimed audiobooks
    const [existingBook] = await db
      .select({ userId: audiobooks.userId })
      .from(audiobooks)
      .where(and(eq(audiobooks.id, bookId), inArray(audiobooks.userId, allowedUserIds)));
    if (!existingBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const intermediateDir = join(
      getAudiobooksRootDir({
        userId: existingBook.userId,
        authEnabled,
        namespace: testNamespace,
      }),
      `${bookId}-audiobook`,
    );
    const dirExists = existsSync(intermediateDir);
    if (!dirExists) {
      await pruneAudiobookIfMissingDir(bookId, existingBook.userId, false);
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const chapter = await findStoredChapterByIndex(intermediateDir, chapterIndex, request.signal);
    const chapterFileExists = !!chapter?.filePath && existsSync(chapter.filePath);
    if (!chapterFileExists) {
      await pruneAudiobookChapterIfMissingFile(bookId, existingBook.userId, chapterIndex, false);
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Stream the chapter file
    const stream = createReadStream(chapter.filePath);

    const readableWebStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        stream.on('end', () => {
          controller.close();
        });
        stream.on('error', (err) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      }
    });

    const mimeType = chapter.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    const sanitizedTitle = chapter.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    return new NextResponse(readableWebStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${sanitizedTitle}.${chapter.format}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Error downloading chapter:', error);
    return NextResponse.json(
      { error: 'Failed to download chapter' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    const chapterIndexStr = request.nextUrl.searchParams.get('chapterIndex');

    if (!bookId || !chapterIndexStr) {
      return NextResponse.json(
        { error: 'Missing bookId or chapterIndex parameter' },
        { status: 400 }
      );
    }

    const chapterIndex = parseInt(chapterIndexStr, 10);
    if (isNaN(chapterIndex)) {
      return NextResponse.json(
        { error: 'Invalid chapterIndex parameter' },
        { status: 400 }
      );
    }

    await ensureAudiobooksV1Ready();
    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const { userId, authEnabled } = ctxOrRes;
    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const storageUserId = userId ?? getUnclaimedUserIdForNamespace(testNamespace);

    await ensureDbIndexed();

    // Verify ownership and delete from DB with composite PK
    const [existingBook] = await db
      .select({ userId: audiobooks.userId })
      .from(audiobooks)
      .where(and(eq(audiobooks.id, bookId), eq(audiobooks.userId, storageUserId)));
    if (!existingBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Delete from DB
    await db.delete(audiobookChapters).where(
      and(
        eq(audiobookChapters.bookId, bookId),
        eq(audiobookChapters.userId, storageUserId),
        eq(audiobookChapters.chapterIndex, chapterIndex),
      ),
    );

    const intermediateDir = join(
      getAudiobooksRootDir({
        userId: storageUserId,
        authEnabled,
        namespace: testNamespace,
      }),
      `${bookId}-audiobook`,
    );
    const chapterPrefix = `${String(chapterIndex + 1).padStart(4, '0')}__`;
    const files = await readdir(intermediateDir).catch(() => []);
    for (const file of files) {
      if (!file.startsWith(chapterPrefix)) continue;
      if (!file.endsWith('.mp3') && !file.endsWith('.m4b')) continue;
      await unlink(join(intermediateDir, file)).catch(() => { });
    }

    // Invalidate any combined "complete" files
    const completeM4b = join(intermediateDir, `complete.m4b`);
    const completeMp3 = join(intermediateDir, `complete.mp3`);
    if (existsSync(completeM4b)) await unlink(completeM4b).catch(() => { });
    if (existsSync(completeMp3)) await unlink(completeMp3).catch(() => { });
    await unlink(join(intermediateDir, 'complete.mp3.manifest.json')).catch(() => { });
    await unlink(join(intermediateDir, 'complete.m4b.manifest.json')).catch(() => { });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json(
      { error: 'Failed to delete chapter' },
      { status: 500 }
    );
  }
}
