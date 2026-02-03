import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { readdir, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { AUDIOBOOKS_V1_DIR, getUserAudiobookDir, UNCLAIMED_USER_ID, isAudiobooksV1Ready } from '@/lib/server/docstore';
import { findStoredChapterByIndex } from '@/lib/server/audiobook';
import { db } from '@/db';
import { audiobooks, audiobookChapters } from '@/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { requireAuthContext } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Get the base audiobooks directory, accounting for test namespaces.
 * When auth is disabled, returns AUDIOBOOKS_V1_DIR.
 * When auth is enabled, returns the user-specific directory.
 */
function getAudiobooksRootDir(request: NextRequest, userId: string | null, authEnabled: boolean): string {
  const raw = request.headers.get('x-openreader-test-namespace')?.trim();
  
  const getTestNamespacePath = (baseDir: string): string => {
    if (!raw) return baseDir;
    const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe || safe === '.' || safe === '..' || safe.includes('..')) {
      return baseDir;
    }
    const resolved = resolve(baseDir, safe);
    if (!resolved.startsWith(resolve(baseDir) + '/')) {
      return baseDir;
    }
    return resolved;
  };

  if (!authEnabled || !userId) {
    return getTestNamespacePath(AUDIOBOOKS_V1_DIR);
  }

  const userDir = getUserAudiobookDir(userId);
  return getTestNamespacePath(userDir);
}

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

    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const { userId, authEnabled } = ctxOrRes;

    // Verify ownership with composite PK - allow access to user's own OR unclaimed audiobooks
    if (authEnabled && db && userId) {
      const [existingBook] = await db.select().from(audiobooks).where(
        and(
          eq(audiobooks.id, bookId),
          or(eq(audiobooks.userId, userId), eq(audiobooks.userId, UNCLAIMED_USER_ID))
        )
      );
      if (!existingBook) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
      }
    }

    // Get the audiobook directory - check user's directory first, then unclaimed
    let intermediateDir = join(getAudiobooksRootDir(request, userId, authEnabled), `${bookId}-audiobook`);
    
    // If not found in user's directory and auth is enabled, check unclaimed directory
    if (!existsSync(intermediateDir) && authEnabled && userId) {
      const unclaimedDir = join(getAudiobooksRootDir(request, UNCLAIMED_USER_ID, authEnabled), `${bookId}-audiobook`);
      if (existsSync(unclaimedDir)) {
        intermediateDir = unclaimedDir;
      }
    }

    const chapter = await findStoredChapterByIndex(intermediateDir, chapterIndex, request.signal);
    if (!chapter || !existsSync(chapter.filePath)) {
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

    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const { userId, authEnabled } = ctxOrRes;

    // Verify ownership and delete from DB with composite PK
    if (authEnabled && db && userId) {
      const [existingBook] = await db.select().from(audiobooks).where(
        and(eq(audiobooks.id, bookId), eq(audiobooks.userId, userId))
      );
      if (!existingBook) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
      }

      // Delete from DB
      await db.delete(audiobookChapters).where(
        and(
          eq(audiobookChapters.bookId, bookId),
          eq(audiobookChapters.userId, userId),
          eq(audiobookChapters.chapterIndex, chapterIndex)
        ),
      );
    }

    const intermediateDir = join(getAudiobooksRootDir(request, userId, authEnabled), `${bookId}-audiobook`);
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
