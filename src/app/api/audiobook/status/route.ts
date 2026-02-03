import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { AUDIOBOOKS_V1_DIR, UNCLAIMED_USER_ID, getUserAudiobookDir, isAudiobooksV1Ready } from '@/lib/server/docstore';
import { listStoredChapters } from '@/lib/server/audiobook';
import type { AudiobookGenerationSettings } from '@/types/client';
import type { TTSAudiobookFormat, TTSAudiobookChapter } from '@/types/tts';
import { readFile } from 'fs/promises';
import { requireAuthContext } from '@/lib/server/auth';
import { db } from '@/db';
import { audiobooks } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Get the base audiobooks directory, accounting for test namespaces.
 * When auth is disabled, returns AUDIOBOOKS_V1_DIR.
 * When auth is enabled, returns the user-specific directory.
 */
function getAudiobooksRootDir(request: NextRequest, userId: string | null, authEnabled: boolean): string {
  const raw = request.headers.get('x-openreader-test-namespace')?.trim();
  
  const applyTestNamespace = (baseDir: string): string => {
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
    return applyTestNamespace(AUDIOBOOKS_V1_DIR);
  }

  const userDir = getUserAudiobookDir(userId);
  return applyTestNamespace(userDir);
}

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

    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const { userId, authEnabled } = ctxOrRes;

    // Check if audiobook exists for user OR is unclaimed (similar to documents)
    if (authEnabled && db && userId) {
      const [existingBook] = await db.select().from(audiobooks).where(
        and(
          eq(audiobooks.id, bookId),
          or(eq(audiobooks.userId, userId), eq(audiobooks.userId, UNCLAIMED_USER_ID))
        )
      );
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

    if (!existsSync(intermediateDir)) {
      return NextResponse.json({
        chapters: [],
        exists: false,
        hasComplete: false,
        bookId: null,
        settings: null,
      });
    }

    const stored = await listStoredChapters(intermediateDir, request.signal);
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
