import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, unlink, readdir, rm } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

interface ConversionRequest {
  chapterTitle: string;
  buffer: number[];
  bookId?: string;
  format?: 'mp3' | 'm4b';
  chapterIndex?: number;
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

async function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

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

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const data: ConversionRequest = await request.json();
    const format = data.format || 'm4b';
    
    // Use docstore directory
    const docstoreDir = join(process.cwd(), 'docstore');
    if (!existsSync(docstoreDir)) {
      await mkdir(docstoreDir);
    }

    // Generate or use existing book ID
    const bookId = data.bookId || randomUUID();
    const intermediateDir = join(docstoreDir, `${bookId}-audiobook`);
    
    // Create intermediate directory
    if (!existsSync(intermediateDir)) {
      await mkdir(intermediateDir);
    }

    // Use provided chapter index or find the next available index robustly (handles gaps)
    let chapterIndex: number;
    if (data.chapterIndex !== undefined) {
      chapterIndex = data.chapterIndex;
    } else {
      const files = await readdir(intermediateDir);
      const indices = files
        .map(f => f.match(/^(\d+)-chapter\.(m4b|mp3)$/))
        .filter((m): m is RegExpMatchArray => Boolean(m))
        .map(m => parseInt(m[1], 10))
        .sort((a, b) => a - b);
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
    const chapterOutputPath = join(intermediateDir, `${chapterIndex}-chapter.${format}`);
    const metadataPath = join(intermediateDir, `${chapterIndex}.meta.json`);
    
    // Write the chapter audio to a temp file
    await writeFile(inputPath, Buffer.from(new Uint8Array(data.buffer)));
    
    if (format === 'mp3') {
      // For MP3, re-encode to ensure proper headers and consistent format
      await runFFmpeg([
        '-y', // Overwrite output file without asking
        '-i', inputPath,
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        '-metadata', `title=${data.chapterTitle}`,
        chapterOutputPath
      ], request.signal);
    } else {
      // Convert MP3 to M4B container with proper encoding and metadata
      await runFFmpeg([
        '-y', // Overwrite output file without asking
        '-i', inputPath,
        '-c:a', 'aac',
        '-b:a', '64k',
        '-metadata', `title=${data.chapterTitle}`,
        '-f', 'mp4',
        chapterOutputPath
      ], request.signal);
    }

    // Get the duration and save metadata
    const duration = await getAudioDuration(chapterOutputPath, request.signal);
    await writeFile(metadataPath, JSON.stringify({
      title: data.chapterTitle,
      duration,
      index: chapterIndex,
      format
    }));

    // Clean up input file
    await unlink(inputPath).catch(console.error);

    return NextResponse.json({ 
      bookId,
      chapterIndex,
      duration
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
    const requestedFormat = request.nextUrl.searchParams.get('format') as 'mp3' | 'm4b' | null;
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }

    const docstoreDir = join(process.cwd(), 'docstore');
    const intermediateDir = join(docstoreDir, `${bookId}-audiobook`);

    if (!existsSync(intermediateDir)) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Read all chapter metadata
    const files = await readdir(intermediateDir);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));
    const chapters: { title: string; duration: number; index: number; format: string }[] = [];
    
    for (const metaFile of metaFiles) {
      const meta = JSON.parse(await readFile(join(intermediateDir, metaFile), 'utf-8'));
      chapters.push(meta);
    }

    if (chapters.length === 0) {
      return NextResponse.json({ error: 'No chapters found' }, { status: 404 });
    }

    // Sort chapters by index
    chapters.sort((a, b) => a.index - b.index);
    // Determine output format from existing chapter metadata to avoid mismatches
    const chapterFormat = (chapters[0]?.format === 'mp3' || chapters[0]?.format === 'm4b') ? chapters[0].format : 'm4b';
    if (requestedFormat && requestedFormat !== chapterFormat) {
      console.warn(`Requested format ${requestedFormat} differs from chapter format ${chapterFormat}. Using ${chapterFormat}.`);
    }
    const format = chapterFormat;
    const outputPath = join(intermediateDir, `complete.${format}`);
    const metadataPath = join(intermediateDir, 'metadata.txt');
    const listPath = join(intermediateDir, 'list.txt');

    // Check if combined file already exists
    if (existsSync(outputPath)) {
      // Stream the existing file
      return streamFile(outputPath, format);
    }

    // Create chapter metadata file for M4B
    const metadata: string[] = [];
    let currentTime = 0;
    
    chapters.forEach((chapter) => {
      const startMs = Math.floor(currentTime * 1000);
      currentTime += chapter.duration;
      const endMs = Math.floor(currentTime * 1000);

      metadata.push(
        `[CHAPTER]`,
        `TIMEBASE=1/1000`,
        `START=${startMs}`,
        `END=${endMs}`,
        `title=${chapter.title}`
      );
    });
    
    await writeFile(metadataPath, ';FFMETADATA1\n' + metadata.join('\n'));

    // Create list file for concat
    await writeFile(
      listPath,
      chapters.map(c => `file '${join(intermediateDir, `${c.index}-chapter.${format}`)}'`).join('\n')
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
        '-c:a', 'copy',
        '-f', 'mp4',
        outputPath
      ], request.signal);
    }

    // Clean up temporary files (but keep the chapters and complete file)
    await Promise.all([
      unlink(metadataPath).catch(console.error),
      unlink(listPath).catch(console.error)
    ]);

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

    const docstoreDir = join(process.cwd(), 'docstore');
    const intermediateDir = join(docstoreDir, `${bookId}-audiobook`);

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