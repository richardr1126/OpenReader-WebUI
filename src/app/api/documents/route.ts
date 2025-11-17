import { writeFile, readFile, readdir, mkdir, unlink } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import type { BaseDocument, SyncedDocument } from '@/types/documents';

const DOCS_DIR = path.join(process.cwd(), 'docstore');

// Ensure documents directory exists
async function ensureDocsDir() {
  try {
    await mkdir(DOCS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating documents directory:', error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDocsDir();
    const data = await req.json();
    const documents = data.documents as SyncedDocument[];
    
    // Save document metadata and content
    for (const doc of documents) {
      const docPath = path.join(DOCS_DIR, `${doc.id}.json`);
      const contentPath = path.join(DOCS_DIR, `${doc.id}.${doc.type}`);
      
      // Save metadata (excluding binary data)
      const metadata = {
        id: doc.id,
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        type: doc.type
      };
      
      await writeFile(docPath, JSON.stringify(metadata));

      // Save content as raw binary file with proper handling for both PDF and EPUB
      const content = Buffer.from(new Uint8Array(doc.data));
      await writeFile(contentPath, content);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving documents:', error);
    return NextResponse.json({ error: 'Failed to save documents' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureDocsDir();
    const documents: SyncedDocument[] = [];
    
    const files = await readdir(DOCS_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    for (const file of jsonFiles) {
      const docPath = path.join(DOCS_DIR, file);
      
      try {
        const metadata = JSON.parse(await readFile(docPath, 'utf8')) as BaseDocument;
        const contentPath = path.join(DOCS_DIR, `${metadata.id}.${metadata.type}`);
        const content = await readFile(contentPath);
        
        // Ensure consistent array format for both PDF and EPUB
        const uint8Array = new Uint8Array(content);
        
        documents.push({
          ...metadata,
          data: Array.from(uint8Array)
        });
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
        continue;
      }
    }

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error loading documents:', error);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await ensureDocsDir();
    const files = await readdir(DOCS_DIR);
    
    for (const file of files) {
      const filePath = path.join(DOCS_DIR, file);
      await unlink(filePath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting documents:', error);
    return NextResponse.json({ error: 'Failed to delete documents' }, { status: 500 });
  }
}
