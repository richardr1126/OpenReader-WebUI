import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { AUDIOBOOKS_V1_DIR, isAudiobooksV1Ready } from '@/lib/server/docstore';
import { listStoredChapters } from '@/lib/server/audiobook';
import type { AudiobookGenerationSettings } from '@/types/client';
import type { TTSAudiobookFormat, TTSAudiobookChapter } from '@/types/tts';
import { readFile } from 'fs/promises';

function getAudiobooksRootDir(request: NextRequest): string {
  const raw = request.headers.get('x-openreader-test-namespace')?.trim();
  if (!raw) return AUDIOBOOKS_V1_DIR;
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '');
  return safe ? join(AUDIOBOOKS_V1_DIR, safe) : AUDIOBOOKS_V1_DIR;
}

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }

    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }
    const intermediateDir = join(getAudiobooksRootDir(request), `${bookId}-audiobook`);

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
