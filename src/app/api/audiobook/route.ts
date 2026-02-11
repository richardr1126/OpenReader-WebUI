import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { audiobooks, audiobookChapters } from '@/db/schema';
import { requireAuthContext } from '@/lib/server/auth';
import {
  audiobookPrefix,
  deleteAudiobookObject,
  deleteAudiobookPrefix,
  getAudiobookObjectBuffer,
  isMissingBlobError,
  listAudiobookObjects,
  putAudiobookObject,
} from '@/lib/server/audiobooks-blobstore';
import {
  decodeChapterFileName,
  encodeChapterFileName,
  encodeChapterTitleTag,
  escapeFFMetadata,
  ffprobeAudio,
} from '@/lib/server/audiobook';
import { isS3Configured } from '@/lib/server/s3';
import { getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';
import { getFFmpegPath, getFFprobePath } from '@/lib/server/ffmpeg-bin';
import type { AudiobookGenerationSettings } from '@/types/client';
import type { TTSAudioBytes, TTSAudiobookFormat } from '@/types/tts';

export const dynamic = 'force-dynamic';

interface ConversionRequest {
  chapterTitle: string;
  buffer: TTSAudioBytes;
  bookId?: string;
  format?: TTSAudiobookFormat;
  chapterIndex?: number;
  settings?: AudiobookGenerationSettings;
}

type ChapterObject = {
  index: number;
  title: string;
  format: TTSAudiobookFormat;
  fileName: string;
};

const SAFE_ID_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

function isSafeId(value: string): boolean {
  return SAFE_ID_REGEX.test(value);
}

function s3NotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Audiobooks storage is not configured. Set S3_* environment variables.' },
    { status: 503 },
  );
}

function chapterFileMimeType(format: TTSAudiobookFormat): string {
  return format === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
}

function buildAtempoFilter(speed: number): string {
  const clamped = Math.max(0.5, Math.min(speed, 3));
  if (clamped <= 2) return `atempo=${clamped.toFixed(3)}`;
  const second = clamped / 2;
  return `atempo=2.0,atempo=${second.toFixed(3)}`;
}

function listChapterObjects(objectNames: string[]): ChapterObject[] {
  const chapters = objectNames
    .filter((name) => !name.startsWith('complete.'))
    .map((fileName) => {
      const decoded = decodeChapterFileName(fileName);
      if (!decoded) return null;
      return {
        index: decoded.index,
        title: decoded.title,
        format: decoded.format,
        fileName,
      } satisfies ChapterObject;
    })
    .filter((value): value is ChapterObject => Boolean(value))
    .sort((a, b) => a.index - b.index);

  const deduped = new Map<number, ChapterObject>();
  for (const chapter of chapters) {
    const existing = deduped.get(chapter.index);
    if (!existing) {
      deduped.set(chapter.index, chapter);
      continue;
    }
    if (chapter.fileName > existing.fileName) {
      deduped.set(chapter.index, chapter);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.index - b.index);
}

function streamBuffer(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
}

async function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(getFFmpegPath(), args);
    let finished = false;

    const onAbort = () => {
      if (finished) return;
      finished = true;
      try {
        ffmpeg.kill('SIGKILL');
      } catch {}
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

async function getAudioDuration(filePath: string, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(getFFprobePath(), [
      '-i',
      filePath,
      '-show_entries',
      'format=duration',
      '-v',
      'quiet',
      '-of',
      'csv=p=0',
    ]);

    let output = '';
    let finished = false;

    const onAbort = () => {
      if (finished) return;
      finished = true;
      try {
        ffprobe.kill('SIGKILL');
      } catch {}
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

export async function POST(request: NextRequest) {
  let workDir: string | null = null;
  try {
    if (!isS3Configured()) return s3NotConfiguredResponse();

    const data: ConversionRequest = await request.json();
    const requestedFormat = data.format || 'm4b';

    const ctxOrRes = await requireAuthContext(request);
    if (ctxOrRes instanceof Response) return ctxOrRes;

    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const storageUserId = ctxOrRes.userId ?? getUnclaimedUserIdForNamespace(testNamespace);
    const bookId = data.bookId || randomUUID();

    if (!isSafeId(bookId)) {
      return NextResponse.json({ error: 'Invalid bookId parameter' }, { status: 400 });
    }

    await db
      .insert(audiobooks)
      .values({
        id: bookId,
        userId: storageUserId,
        title: data.chapterTitle || 'Untitled Audiobook',
      })
      .onConflictDoNothing();

    const objects = await listAudiobookObjects(bookId, storageUserId, testNamespace);
    const objectNames = objects.map((item) => item.fileName);
    const existingChapters = listChapterObjects(objectNames);
    const hasChapters = existingChapters.length > 0;

    let existingSettings: AudiobookGenerationSettings | null = null;
    try {
      existingSettings = JSON.parse((await getAudiobookObjectBuffer(bookId, storageUserId, 'audiobook.meta.json', testNamespace)).toString('utf8')) as AudiobookGenerationSettings;
    } catch (error) {
      if (!isMissingBlobError(error)) throw error;
      existingSettings = null;
    }

    const incomingSettings = data.settings;
    if (existingSettings && hasChapters && incomingSettings) {
      const mismatch =
        existingSettings.ttsProvider !== incomingSettings.ttsProvider ||
        existingSettings.ttsModel !== incomingSettings.ttsModel ||
        existingSettings.voice !== incomingSettings.voice ||
        existingSettings.nativeSpeed !== incomingSettings.nativeSpeed ||
        existingSettings.postSpeed !== incomingSettings.postSpeed ||
        existingSettings.format !== incomingSettings.format;
      if (mismatch) {
        return NextResponse.json({ error: 'Audiobook settings mismatch', settings: existingSettings }, { status: 409 });
      }
    }

    const existingFormats = new Set(existingChapters.map((chapter) => chapter.format));
    if (existingFormats.size > 1) {
      return NextResponse.json({ error: 'Mixed chapter formats detected; reset the audiobook to continue' }, { status: 400 });
    }

    const format: TTSAudiobookFormat =
      (existingFormats.values().next().value as TTSAudiobookFormat | undefined) ??
      existingSettings?.format ??
      incomingSettings?.format ??
      requestedFormat;
    const rawPostSpeed = incomingSettings?.postSpeed ?? existingSettings?.postSpeed ?? 1;
    const postSpeed = Number.isFinite(Number(rawPostSpeed)) ? Number(rawPostSpeed) : 1;

    let chapterIndex: number;
    if (data.chapterIndex !== undefined) {
      const normalized = Number(data.chapterIndex);
      if (!Number.isInteger(normalized) || normalized < 0) {
        return NextResponse.json({ error: 'Invalid chapterIndex parameter' }, { status: 400 });
      }
      chapterIndex = normalized;
    } else {
      const indices = existingChapters.map((c) => c.index);
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

    workDir = await mkdtemp(join(tmpdir(), 'openreader-audiobook-'));
    const inputPath = join(workDir, `${chapterIndex}-input.mp3`);
    const chapterOutputTempPath = join(workDir, `${chapterIndex}-chapter.tmp.${format}`);
    const titleTag = encodeChapterTitleTag(chapterIndex, data.chapterTitle);

    await writeFile(inputPath, Buffer.from(new Uint8Array(data.buffer)));

    if (format === 'mp3') {
      await runFFmpeg(
        [
          '-y',
          '-i',
          inputPath,
          ...(postSpeed !== 1 ? ['-filter:a', buildAtempoFilter(postSpeed)] : []),
          '-c:a',
          'libmp3lame',
          '-b:a',
          '64k',
          '-metadata',
          `title=${titleTag}`,
          chapterOutputTempPath,
        ],
        request.signal,
      );
    } else {
      await runFFmpeg(
        [
          '-y',
          '-i',
          inputPath,
          ...(postSpeed !== 1 ? ['-filter:a', buildAtempoFilter(postSpeed)] : []),
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-metadata',
          `title=${titleTag}`,
          '-f',
          'mp4',
          chapterOutputTempPath,
        ],
        request.signal,
      );
    }

    const probe = await ffprobeAudio(chapterOutputTempPath, request.signal);
    const duration = probe.durationSec ?? (await getAudioDuration(chapterOutputTempPath, request.signal));

    const finalChapterName = encodeChapterFileName(chapterIndex, data.chapterTitle, format);
    const finalChapterBytes = await readFile(chapterOutputTempPath);
    await putAudiobookObject(bookId, storageUserId, finalChapterName, finalChapterBytes, chapterFileMimeType(format), testNamespace);

    const chapterPrefix = `${String(chapterIndex + 1).padStart(4, '0')}__`;
    for (const fileName of objectNames) {
      if (!fileName.startsWith(chapterPrefix)) continue;
      if (!fileName.endsWith('.mp3') && !fileName.endsWith('.m4b')) continue;
      if (fileName === finalChapterName) continue;
      await deleteAudiobookObject(bookId, storageUserId, fileName, testNamespace).catch(() => {});
    }

    await deleteAudiobookObject(bookId, storageUserId, 'complete.mp3', testNamespace).catch(() => {});
    await deleteAudiobookObject(bookId, storageUserId, 'complete.m4b', testNamespace).catch(() => {});
    await deleteAudiobookObject(bookId, storageUserId, 'complete.mp3.manifest.json', testNamespace).catch(() => {});
    await deleteAudiobookObject(bookId, storageUserId, 'complete.m4b.manifest.json', testNamespace).catch(() => {});

    if (!existingSettings && incomingSettings) {
      await putAudiobookObject(
        bookId,
        storageUserId,
        'audiobook.meta.json',
        Buffer.from(JSON.stringify(incomingSettings, null, 2), 'utf8'),
        'application/json; charset=utf-8',
        testNamespace,
      );
    }

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
      format,
    });
  } catch (error) {
    if ((error as Error)?.message === 'ABORTED' || request.signal.aborted) {
      return NextResponse.json({ error: 'cancelled' }, { status: 499 });
    }
    console.error('Error processing audio chapter:', error);
    return NextResponse.json({ error: 'Failed to process audio chapter' }, { status: 500 });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request: NextRequest) {
  let workDir: string | null = null;
  try {
    if (!isS3Configured()) return s3NotConfiguredResponse();

    const bookId = request.nextUrl.searchParams.get('bookId');
    const requestedFormat = request.nextUrl.searchParams.get('format') as TTSAudiobookFormat | null;
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }
    if (!isSafeId(bookId)) {
      return NextResponse.json({ error: 'Invalid bookId parameter' }, { status: 400 });
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
    const objectNames = objects.map((item) => item.fileName);
    const chapters = listChapterObjects(objectNames);
    if (chapters.length === 0) {
      return NextResponse.json({ error: 'No chapters found' }, { status: 404 });
    }

    const chapterFormats = new Set(chapters.map((chapter) => chapter.format));
    if (chapterFormats.size > 1) {
      return NextResponse.json({ error: 'Mixed chapter formats detected; reset the audiobook to continue' }, { status: 400 });
    }

    const format: TTSAudiobookFormat = requestedFormat ?? chapters[0].format;
    const completeName = `complete.${format}`;
    const manifestName = `${completeName}.manifest.json`;
    const signature = chapters.map((chapter) => ({ index: chapter.index, fileName: chapter.fileName }));

    if (objectNames.includes(completeName) && objectNames.includes(manifestName)) {
      try {
        const manifest = JSON.parse((await getAudiobookObjectBuffer(bookId, existingBook.userId, manifestName, testNamespace)).toString('utf8'));
        if (JSON.stringify(manifest) === JSON.stringify(signature)) {
          const cached = await getAudiobookObjectBuffer(bookId, existingBook.userId, completeName, testNamespace);
          return new NextResponse(streamBuffer(cached), {
            headers: {
              'Content-Type': chapterFileMimeType(format),
              'Content-Disposition': `attachment; filename="audiobook.${format}"`,
              'Cache-Control': 'no-cache',
            },
          });
        }
      } catch {
        // Force regeneration below.
      }

      await deleteAudiobookObject(bookId, existingBook.userId, completeName, testNamespace).catch(() => {});
      await deleteAudiobookObject(bookId, existingBook.userId, manifestName, testNamespace).catch(() => {});
    }

    const chapterRows = await db
      .select({ chapterIndex: audiobookChapters.chapterIndex, duration: audiobookChapters.duration })
      .from(audiobookChapters)
      .where(and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, existingBook.userId)));
    const durationByIndex = new Map<number, number>();
    for (const row of chapterRows) {
      durationByIndex.set(row.chapterIndex, Number(row.duration ?? 0));
    }

    workDir = await mkdtemp(join(tmpdir(), 'openreader-audiobook-combine-'));
    const metadataPath = join(workDir, 'metadata.txt');
    const listPath = join(workDir, 'list.txt');
    const outputPath = join(workDir, completeName);

    const localChapters: Array<{ index: number; title: string; localPath: string; duration: number }> = [];
    for (const chapter of chapters) {
      const localPath = join(workDir, chapter.fileName);
      const bytes = await getAudiobookObjectBuffer(bookId, existingBook.userId, chapter.fileName, testNamespace);
      await writeFile(localPath, bytes);

      let duration = durationByIndex.get(chapter.index) ?? 0;
      if (!duration || duration <= 0) {
        try {
          const probe = await ffprobeAudio(localPath, request.signal);
          if (probe.durationSec && probe.durationSec > 0) {
            duration = probe.durationSec;
          } else {
            duration = await getAudioDuration(localPath, request.signal);
          }
        } catch {
          duration = 0;
        }
      }

      localChapters.push({
        index: chapter.index,
        title: chapter.title,
        localPath,
        duration,
      });
    }

    const metadata: string[] = [];
    let currentTime = 0;
    for (const chapter of localChapters) {
      const startMs = Math.floor(currentTime * 1000);
      currentTime += chapter.duration;
      const endMs = Math.floor(currentTime * 1000);
      metadata.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${startMs}`, `END=${endMs}`, `title=${escapeFFMetadata(chapter.title)}`);
    }

    await writeFile(metadataPath, ';FFMETADATA1\n' + metadata.join('\n'));
    await writeFile(
      listPath,
      localChapters
        .map((chapter) => `file '${chapter.localPath.replace(/'/g, "'\\''")}'`)
        .join('\n'),
    );

    if (format === 'mp3') {
      await runFFmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-b:a', '64k', outputPath], request.signal);
    } else {
      await runFFmpeg(
        [
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-i',
          metadataPath,
          '-map_metadata',
          '1',
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-f',
          'mp4',
          outputPath,
        ],
        request.signal,
      );
    }

    const outputBytes = await readFile(outputPath);
    await putAudiobookObject(bookId, existingBook.userId, completeName, outputBytes, chapterFileMimeType(format), testNamespace);
    await putAudiobookObject(
      bookId,
      existingBook.userId,
      manifestName,
      Buffer.from(JSON.stringify(signature, null, 2), 'utf8'),
      'application/json; charset=utf-8',
      testNamespace,
    );

    return new NextResponse(streamBuffer(outputBytes), {
      headers: {
        'Content-Type': chapterFileMimeType(format),
        'Content-Disposition': `attachment; filename="audiobook.${format}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    if ((error as Error)?.message === 'ABORTED' || request.signal.aborted) {
      return NextResponse.json({ error: 'cancelled' }, { status: 499 });
    }
    console.error('Error creating full audiobook:', error);
    return NextResponse.json({ error: 'Failed to create full audiobook file' }, { status: 500 });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isS3Configured()) return s3NotConfiguredResponse();

    const bookId = request.nextUrl.searchParams.get('bookId');
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }
    if (!isSafeId(bookId)) {
      return NextResponse.json({ error: 'Invalid bookId parameter' }, { status: 400 });
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
      .where(and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, storageUserId)));

    await db.delete(audiobooks).where(and(eq(audiobooks.id, bookId), eq(audiobooks.userId, storageUserId)));

    const deleted = await deleteAudiobookPrefix(audiobookPrefix(bookId, storageUserId, testNamespace)).catch(() => 0);
    return NextResponse.json({ success: true, existed: deleted > 0 });
  } catch (error) {
    console.error('Error resetting audiobook:', error);
    return NextResponse.json({ error: 'Failed to reset audiobook' }, { status: 500 });
  }
}
