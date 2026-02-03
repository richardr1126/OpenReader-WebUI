import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFile, writeFile, mkdir, unlink, rm, rename, readdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { AUDIOBOOKS_V1_DIR, ensureAudiobooksV1Ready, isAudiobooksV1Ready, getUserAudiobookDir } from '@/lib/server/docstore';
import { encodeChapterFileName, encodeChapterTitleTag, listStoredChapters, ffprobeAudio, escapeFFMetadata } from '@/lib/server/audiobook';
import type { TTSAudioBytes, TTSAudiobookFormat } from '@/types/tts';
import type { AudiobookGenerationSettings } from '@/types/client';
import { db } from '@/db';
import { audiobooks, audiobookChapters } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuthContext } from '@/lib/server/auth';
import { ensureDbIndexed } from '@/lib/server/db-indexing';
import { applyOpenReaderTestNamespacePath, getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';

export const dynamic = 'force-dynamic';

/**
 * Apply test namespace to a directory path if present in request headers.
 */
function applyTestNamespace(baseDir: string, request: NextRequest): string {
  const namespace = getOpenReaderTestNamespace(request.headers);
  return applyOpenReaderTestNamespacePath(baseDir, namespace);
}

/**
 * Get the base audiobooks directory, accounting for test namespaces.
 * When auth is disabled, returns AUDIOBOOKS_V1_DIR (possibly with test namespace).
 * When auth is enabled, returns the user-specific directory under AUDIOBOOKS_USERS_DIR.
 */
function getAudiobooksRootDir(request: NextRequest, userId: string | null, authEnabled: boolean): string {
  // When auth is disabled, use the flat audiobooks_v1 directory
  if (!authEnabled || !userId) {
    return applyTestNamespace(AUDIOBOOKS_V1_DIR, request);
  }

  // When auth is enabled, use user-specific directory
  const userDir = getUserAudiobookDir(userId);
  return applyTestNamespace(userDir, request);
}

interface ConversionRequest {
  chapterTitle: string;
  buffer: TTSAudioBytes;
  bookId?: string;
  format?: TTSAudiobookFormat;
  chapterIndex?: number;
  settings?: AudiobookGenerationSettings;
}

async function getAudioDuration(filePath: string, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-i', filePath,
      '-show_entries', 'format=duration',
      '-v', 'quiet',
      '-of', 'csv=p=0'
    ]);

    let output = '';
    let finished = false;

    const onAbort = () => {
      if (finished) return;
      finished = true;
      try {
        ffprobe.kill('SIGKILL');
      } catch { }
      reject(new Error('ABORTED'));
    };

    const cleanup = () => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (finished) return;
      cleanup();
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(duration);
      } else {
        reject(new Error(`ffprobe process exited with code ${code}`));
      }
    });

    ffprobe.on('error', (err) => {
      if (finished) return;
      cleanup();
      reject(err);
    });
  });
}

async function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    let finished = false;

    const onAbort = () => {
      if (finished) return;
      finished = true;
      try {
        ffmpeg.kill('SIGKILL');
      } catch { }
      reject(new Error('ABORTED'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    ffmpeg.stderr.on('data', (data) => {
      console.error(`ffmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', (code) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

function buildAtempoFilter(speed: number): string {
  const clamped = Math.max(0.5, Math.min(speed, 3));
  // atempo supports 0.5..2.0 per filter; chain for >2.0
  if (clamped <= 2) return `atempo=${clamped.toFixed(3)}`;
  const second = clamped / 2;
  return `atempo=2.0,atempo=${second.toFixed(3)}`;
}

const SAFE_ID_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

function isSafeId(value: string): boolean {
  return SAFE_ID_REGEX.test(value);
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const data: ConversionRequest = await request.json();
    const requestedFormat = data.format || 'm4b';

    await ensureAudiobooksV1Ready();
    if (!(await isAudiobooksV1Ready())) {
      return NextResponse.json(
        { error: 'Audiobooks storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const userId = ctxOrRes.userId;
    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const storageUserId = userId ?? getUnclaimedUserIdForNamespace(testNamespace);

    // Generate or use existing book ID
    const bookId = data.bookId || randomUUID();

    if (!isSafeId(bookId)) {
      return NextResponse.json({ error: 'Invalid bookId parameter' }, { status: 400 });
    }

    // DB Check / Insert Audiobook
    await db
      .insert(audiobooks)
      .values({
        id: bookId,
        userId: storageUserId,
        title: data.chapterTitle || 'Untitled Audiobook',
      })
      .onConflictDoNothing();

    const intermediateDir = join(getAudiobooksRootDir(request, userId, ctxOrRes.authEnabled), `${bookId}-audiobook`);

    // Create intermediate directory
    await mkdir(intermediateDir, { recursive: true });

    const existingChapters = await listStoredChapters(intermediateDir, request.signal);
    const hasChapters = existingChapters.length > 0;

    const metaPath = join(intermediateDir, 'audiobook.meta.json');
    const incomingSettings = data.settings;
    let existingSettings: AudiobookGenerationSettings | null = null;
    try {
      existingSettings = JSON.parse(await readFile(metaPath, 'utf8')) as AudiobookGenerationSettings;
    } catch {
      existingSettings = null;
    }

    // Only enforce mismatch check if we already have generated chapters.
    // If no chapters exist, we can overwrite/ignore "existing" settings (which might be stale or partial).
    if (existingSettings && hasChapters) {
      if (incomingSettings) {
        const mismatch =
          existingSettings.ttsProvider !== incomingSettings.ttsProvider ||
          existingSettings.ttsModel !== incomingSettings.ttsModel ||
          existingSettings.voice !== incomingSettings.voice ||
          existingSettings.nativeSpeed !== incomingSettings.nativeSpeed ||
          existingSettings.postSpeed !== incomingSettings.postSpeed ||
          existingSettings.format !== incomingSettings.format;
        if (mismatch) {
          return NextResponse.json(
            { error: 'Audiobook settings mismatch', settings: existingSettings },
            { status: 409 },
          );
        }
      }
    }
    // Note: We deliberately do NOT write the meta file here yet.
    // We wait until a chapter is successfully generated/saved below.
    const existingFormats = new Set(existingChapters.map((c) => c.format));
    if (existingFormats.size > 1) {
      return NextResponse.json(
        { error: 'Mixed chapter formats detected; reset the audiobook to continue' },
        { status: 400 },
      );
    }

    const format: TTSAudiobookFormat =
      (existingFormats.values().next().value as TTSAudiobookFormat | undefined) ??
      existingSettings?.format ??
      incomingSettings?.format ??
      requestedFormat;
    const rawPostSpeed = incomingSettings?.postSpeed ?? existingSettings?.postSpeed ?? 1;
    const postSpeed = Number.isFinite(Number(rawPostSpeed)) ? Number(rawPostSpeed) : 1;

    // Use provided chapter index or find the next available index robustly (handles gaps)
    // Use provided chapter index or find the next available index robustly (handles gaps)
    let chapterIndex: number;
    if (data.chapterIndex !== undefined) {
      const normalized = Number(data.chapterIndex);
      if (!Number.isInteger(normalized) || normalized < 0) {
        return NextResponse.json({ error: 'Invalid chapterIndex parameter' }, { status: 400 });
      }
      chapterIndex = normalized;
    } else {
      const indices = existingChapters.map((c) => c.index);
      // Find smallest non-negative integer not present
      let next = 0;
      for (const idx of indices) {
        if (idx === next) {
          next++;
        } else if (idx > next) {
          break;
        }
      }
      chapterIndex = next;
    }

    // Write input file (MP3 from TTS)
    const inputPath = join(intermediateDir, `${chapterIndex}-input.mp3`);
    const chapterOutputTempPath = join(intermediateDir, `${chapterIndex}-chapter.tmp.${format}`);
    const titleTag = encodeChapterTitleTag(chapterIndex, data.chapterTitle);

    // Write the chapter audio to a temp file
    await writeFile(inputPath, Buffer.from(new Uint8Array(data.buffer)));

    // We intentionally do not delete the existing chapter file up-front. This avoids a long
    // window where the chapter is "missing" while ffmpeg is running (which can lead to
    // partial/stale "complete.*" downloads). We clean up duplicates and invalidate the
    // combined output only after the new chapter is written successfully.

    if (format === 'mp3') {
      // For MP3, re-encode to ensure proper headers and consistent format
      await runFFmpeg([
        '-y', // Overwrite output file without asking
        '-i', inputPath,
        ...(postSpeed !== 1 ? ['-filter:a', buildAtempoFilter(postSpeed)] : []),
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        '-metadata', `title=${titleTag}`,
        chapterOutputTempPath
      ], request.signal);
    } else {
      // Convert MP3 to M4B container with proper encoding and metadata
      await runFFmpeg([
        '-y', // Overwrite output file without asking
        '-i', inputPath,
        ...(postSpeed !== 1 ? ['-filter:a', buildAtempoFilter(postSpeed)] : []),
        '-c:a', 'aac',
        '-b:a', '64k',
        '-metadata', `title=${titleTag}`,
        '-f', 'mp4',
        chapterOutputTempPath
      ], request.signal);
    }

    const probe = await ffprobeAudio(chapterOutputTempPath, request.signal);
    const duration = probe.durationSec ?? (await getAudioDuration(chapterOutputTempPath, request.signal));

    const finalChapterPath = join(intermediateDir, encodeChapterFileName(chapterIndex, data.chapterTitle, format));
    await unlink(finalChapterPath).catch(() => { });
    await rename(chapterOutputTempPath, finalChapterPath);

    // Remove any existing chapter files for this index (e.g., if the title changed and the
    // filename changed) and invalidate the combined output now that the chapter is updated.
    const chapterPrefix = `${String(chapterIndex + 1).padStart(4, '0')}__`;
    const finalChapterName = basename(finalChapterPath);
    const existingFiles = await readdir(intermediateDir).catch(() => []);
    for (const file of existingFiles) {
      if (!file.startsWith(chapterPrefix)) continue;
      if (!file.endsWith('.mp3') && !file.endsWith('.m4b')) continue;
      if (file === finalChapterName) continue;
      await unlink(join(intermediateDir, file)).catch(() => { });
    }
    await unlink(join(intermediateDir, 'complete.mp3')).catch(() => { });
    await unlink(join(intermediateDir, 'complete.m4b')).catch(() => { });
    await unlink(join(intermediateDir, 'complete.mp3.manifest.json')).catch(() => { });
    await unlink(join(intermediateDir, 'complete.m4b.manifest.json')).catch(() => { });

    // Ensure meta exists after first successful chapter.
    if (!existingSettings && incomingSettings) {
      await writeFile(metaPath, JSON.stringify(incomingSettings, null, 2)).catch(() => { });
    }

    // Clean up input file
    await unlink(inputPath).catch(console.error);

    // Insert Chapter Record (Denormalized)
    await db
      .insert(audiobookChapters)
      .values({
        id: `${bookId}-${chapterIndex}`,
        bookId,
        userId: storageUserId,
        chapterIndex,
        title: data.chapterTitle,
        duration,
        format,
        filePath: finalChapterName,
      })
      .onConflictDoUpdate({
        target: [audiobookChapters.id, audiobookChapters.userId],
        set: { title: data.chapterTitle, duration, format, filePath: finalChapterName },
      });

    return NextResponse.json({
      index: chapterIndex,
      title: data.chapterTitle,
      duration,
      status: 'completed' as const,
      bookId,
      format
    });

  } catch (error) {
    if ((error as Error)?.message === 'ABORTED' || request.signal.aborted) {
      return NextResponse.json(
        { error: 'cancelled' },
        { status: 499 }
      );
    }
    console.error('Error processing audio chapter:', error);
    return NextResponse.json(
      { error: 'Failed to process audio chapter' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    const requestedFormat = request.nextUrl.searchParams.get('format') as TTSAudiobookFormat | null;
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }
    if (!isSafeId(bookId)) {
      return NextResponse.json({ error: 'Invalid bookId parameter' }, { status: 400 });
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
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const intermediateDir = join(
      getAudiobooksRootDir(request, existingBook.userId, authEnabled),
      `${bookId}-audiobook`,
    );

    if (!existsSync(intermediateDir)) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const stored = await listStoredChapters(intermediateDir, request.signal);
    const chapters = stored.map((chapter) => ({
      title: chapter.title,
      duration: chapter.durationSec ?? 0,
      index: chapter.index,
      format: chapter.format,
      filePath: chapter.filePath,
    }));

    if (chapters.length === 0) {
      return NextResponse.json({ error: 'No chapters found' }, { status: 404 });
    }

    const chapterFormats = new Set(chapters.map((chapter) => chapter.format));
    if (chapterFormats.size > 1) {
      return NextResponse.json(
        { error: 'Mixed chapter formats detected; reset the audiobook to continue' },
        { status: 400 },
      );
    }

    // Sort chapters by index
    chapters.sort((a, b) => a.index - b.index);
    const format: TTSAudiobookFormat = requestedFormat ?? (chapters[0]?.format as TTSAudiobookFormat) ?? 'm4b';
    const outputPath = join(intermediateDir, `complete.${format}`);
    const manifestPath = join(intermediateDir, `complete.${format}.manifest.json`);
    const metadataPath = join(intermediateDir, 'metadata.txt');
    const listPath = join(intermediateDir, 'list.txt');

    const signature = chapters.map((chapter) => ({
      index: chapter.index,
      fileName: basename(chapter.filePath),
    }));

    if (existsSync(outputPath)) {
      let cached: typeof signature | null = null;
      try {
        cached = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof signature;
      } catch {
        cached = null;
      }

      if (cached && JSON.stringify(cached) === JSON.stringify(signature)) {
        return streamFile(outputPath, format);
      }

      await unlink(outputPath).catch(() => { });
      await unlink(manifestPath).catch(() => { });
    }

    // Ensure we have chapter durations for chapter markers / ordering.
    for (const chapter of chapters) {
      if (chapter.duration && chapter.duration > 0) continue;
      try {
        const probe = await ffprobeAudio(chapter.filePath, request.signal);
        if (probe.durationSec && probe.durationSec > 0) {
          chapter.duration = probe.durationSec;
          continue;
        }
      } catch { }

      try {
        chapter.duration = await getAudioDuration(chapter.filePath, request.signal);
      } catch {
        chapter.duration = 0;
      }
    }

    // Create chapter metadata file for M4B
    const metadata: string[] = [];
    let currentTime = 0;

    for (const chapter of chapters) {
      const startMs = Math.floor(currentTime * 1000);
      currentTime += chapter.duration;
      const endMs = Math.floor(currentTime * 1000);

      metadata.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${startMs}`, `END=${endMs}`, `title=${escapeFFMetadata(chapter.title)}`);
    }

    await writeFile(metadataPath, ';FFMETADATA1\n' + metadata.join('\n'));

    // Create list file for concat
    await writeFile(
      listPath,
      chapters.map(c => `file '${c.filePath}'`).join('\n')
    );

    if (format === 'mp3') {
      // For MP3, re-encode to properly rebuild headers and duration metadata
      // Using libmp3lame to ensure proper MP3 structure
      await runFFmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        outputPath
      ], request.signal);
    } else {
      // Combine all files into a single M4B with chapter metadata
      await runFFmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-i', metadataPath,
        '-map_metadata', '1',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-f', 'mp4',
        outputPath
      ], request.signal);
    }

    // Clean up temporary files (but keep the chapters and complete file)
    await Promise.all([
      unlink(metadataPath).catch(console.error),
      unlink(listPath).catch(console.error)
    ]);

    await writeFile(manifestPath, JSON.stringify(signature, null, 2)).catch(() => { });

    // Stream the file back to the client
    return streamFile(outputPath, format);

  } catch (error) {
    if ((error as Error)?.message === 'ABORTED' || request.signal.aborted) {
      return NextResponse.json(
        { error: 'cancelled' },
        { status: 499 }
      );
    }
    console.error('Error creating M4B:', error);
    return NextResponse.json(
      { error: 'Failed to create M4B file' },
      { status: 500 }
    );
  }
}

// Helper function to stream file
function streamFile(filePath: string, format: string) {
  const stream = createReadStream(filePath);

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

  const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';

  return new NextResponse(readableWebStream, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="audiobook.${format}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
export async function DELETE(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }
    if (!isSafeId(bookId)) {
      return NextResponse.json({ error: 'Invalid bookId parameter' }, { status: 400 });
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

    // Delete from DB - with composite PK, we delete by both id and userId
    const [existingBook] = await db
      .select({ userId: audiobooks.userId })
      .from(audiobooks)
      .where(and(eq(audiobooks.id, bookId), eq(audiobooks.userId, storageUserId)));

    if (!existingBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Delete chapters first (no foreign key constraint with composite PK)
    await db
      .delete(audiobookChapters)
      .where(and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, storageUserId)));

    await db.delete(audiobooks).where(and(eq(audiobooks.id, bookId), eq(audiobooks.userId, storageUserId)));

    const intermediateDir = join(getAudiobooksRootDir(request, userId, authEnabled), `${bookId}-audiobook`);

    // If directory doesn't exist, consider it already reset
    if (!existsSync(intermediateDir)) {
      return NextResponse.json({ success: true, existed: false });
    }

    // Recursively delete the entire audiobook directory
    await rm(intermediateDir, { recursive: true, force: true });

    return NextResponse.json({ success: true, existed: true });
  } catch (error) {
    console.error('Error resetting audiobook:', error);
    return NextResponse.json(
      { error: 'Failed to reset audiobook' },
      { status: 500 }
    );
  }
}
