import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';

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

    const docstoreDir = join(process.cwd(), 'docstore');
    const intermediateDir = join(docstoreDir, `${bookId}-audiobook`);
    
    // Read metadata to get format
    const metadataPath = join(intermediateDir, `${chapterIndex}.meta.json`);
    if (!existsSync(metadataPath)) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
    const format = metadata.format || 'm4b';
    const chapterPath = join(intermediateDir, `${chapterIndex}-chapter.${format}`);
    
    if (!existsSync(chapterPath)) {
      return NextResponse.json({ error: 'Chapter file not found' }, { status: 404 });
    }

    // Stream the chapter file
    const stream = createReadStream(chapterPath);

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
    const sanitizedTitle = metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    return new NextResponse(readableWebStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${sanitizedTitle}.${format}"`,
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

    const docstoreDir = join(process.cwd(), 'docstore');
    const intermediateDir = join(docstoreDir, `${bookId}-audiobook`);

    // Read metadata to get format (if present)
    const metadataPath = join(intermediateDir, `${chapterIndex}.meta.json`);

    // Delete the chapter audio file (try both formats just in case)
    const chapterPathM4b = join(intermediateDir, `${chapterIndex}-chapter.m4b`);
    const chapterPathMp3 = join(intermediateDir, `${chapterIndex}-chapter.mp3`);
    if (existsSync(chapterPathM4b)) await unlink(chapterPathM4b).catch(() => {});
    if (existsSync(chapterPathMp3)) await unlink(chapterPathMp3).catch(() => {});

    // Delete metadata if present
    if (existsSync(metadataPath)) {
      await unlink(metadataPath).catch(() => {});
    }

    // Invalidate any combined "complete" files
    const completeM4b = join(intermediateDir, `complete.m4b`);
    const completeMp3 = join(intermediateDir, `complete.mp3`);
    if (existsSync(completeM4b)) await unlink(completeM4b).catch(() => {});
    if (existsSync(completeMp3)) await unlink(completeMp3).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json(
      { error: 'Failed to delete chapter' },
      { status: 500 }
    );
  }
}
