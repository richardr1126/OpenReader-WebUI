import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    const bookId = request.nextUrl.searchParams.get('bookId');
    if (!bookId) {
      return NextResponse.json({ error: 'Missing bookId parameter' }, { status: 400 });
    }

    const docstoreDir = join(process.cwd(), 'docstore');
    const intermediateDir = join(docstoreDir, `${bookId}-audiobook`);

    if (!existsSync(intermediateDir)) {
      return NextResponse.json({ chapters: [], exists: false });
    }

    // Read all chapter metadata
    const files = await readdir(intermediateDir);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));
    const chapters: Array<{
      index: number;
      title: string;
      duration?: number;
      status: 'completed' | 'error';
      bookId: string;
      format?: 'mp3' | 'm4b';
    }> = [];
    
    for (const metaFile of metaFiles) {
      try {
        const meta = JSON.parse(await readFile(join(intermediateDir, metaFile), 'utf-8'));
        chapters.push({
          index: meta.index,
          title: meta.title,
          duration: meta.duration,
          status: 'completed',
          bookId,
          format: meta.format || 'm4b'
        });
      } catch (error) {
        console.error(`Error reading metadata file ${metaFile}:`, error);
      }
    }

    // Sort chapters by index
    chapters.sort((a, b) => a.index - b.index);

    // Check if complete audiobook exists (either format)
    const format = chapters[0]?.format || 'm4b';
    const completePath = join(intermediateDir, `complete.${format}`);
    const hasComplete = existsSync(completePath);

    return NextResponse.json({ 
      chapters, 
      exists: true,
      hasComplete,
      bookId 
    });

  } catch (error) {
    console.error('Error fetching chapters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chapters' },
      { status: 500 }
    );
  }
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
