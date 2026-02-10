import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { getAudiobooksRootDir, ensureAudiobooksV1Ready, isAudiobooksV1Ready } from '@/lib/server/docstore';
import { listStoredChapters } from '@/lib/server/audiobook';
import type { AudiobookGenerationSettings } from '@/types/client';
import type { TTSAudiobookFormat, TTSAudiobookChapter } from '@/types/tts';
import { readFile } from 'fs/promises';
import { requireAuthContext } from '@/lib/server/auth';
import { db } from '@/db';
import { audiobooks } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { ensureDbIndexed } from '@/lib/server/db-indexing';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';
import { pruneAudiobookChaptersNotOnDisk, pruneAudiobookIfMissingDir } from '@/lib/server/audiobook-prune';

export const dynamic = 'force-dynamic';

const SAFE_ID_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

function isSafeId(value: string): boolean {
  return SAFE_ID_REGEX.test(value);
}

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    if (!bookId || !isSafeId(bookId)) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
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

    // Check if audiobook exists for user OR is unclaimed (similar to documents)
    const [existingBook] = await db
      .select({ userId: audiobooks.userId })
      .from(audiobooks)
      .where(and(eq(audiobooks.id, bookId), inArray(audiobooks.userId, allowedUserIds)));
    if (!existingBook) {
      // Book doesn't exist for this user or unclaimed - return empty state
      return NextResponse.json({
        chapters: [],
        exists: false,
        hasComplete: false,
        bookId: null,
        settings: null,
      });
    }

    const intermediateDir = join(
      getAudiobooksRootDir({
        userId: existingBook.userId,
        authEnabled,
        namespace: testNamespace,
      }),
      `${bookId}-audiobook`,
    );

    if (!existsSync(intermediateDir)) {
      await pruneAudiobookIfMissingDir(bookId, existingBook.userId, false);
      return NextResponse.json({
        chapters: [],
        exists: false,
        hasComplete: false,
        bookId: null,
        settings: null,
      });
    }

    const stored = await listStoredChapters(intermediateDir, request.signal);
    await pruneAudiobookChaptersNotOnDisk(
      bookId,
      existingBook.userId,
      stored.map((c) => c.index),
    );
    const chapters: TTSAudiobookChapter[] = stored.map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      duration: chapter.durationSec,
      status: 'completed',
      bookId,
      format: chapter.format as TTSAudiobookFormat,
    }));

    let settings: AudiobookGenerationSettings | null = null;
    try {
      settings = JSON.parse(await readFile(join(intermediateDir, 'audiobook.meta.json'), 'utf8')) as AudiobookGenerationSettings;
    } catch {
      settings = null;
    }

    const hasComplete = existsSync(join(intermediateDir, 'complete.mp3')) || existsSync(join(intermediateDir, 'complete.m4b'));

    return NextResponse.json({
      chapters,
      exists: true,
      hasComplete,
      bookId,
      settings,
    });

  } catch (error) {
    console.error('Error fetching chapters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chapters' },
      { status: 500 }
    );
  }
}
