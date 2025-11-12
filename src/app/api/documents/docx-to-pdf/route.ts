import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, readdir, rm, stat } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';

const DOCSTORE_DIR = path.join(process.cwd(), 'docstore');
const TEMP_DIR = path.join(DOCSTORE_DIR, 'tmp');

async function ensureTempDir() {
  if (!existsSync(DOCSTORE_DIR)) {
    await mkdir(DOCSTORE_DIR, { recursive: true });
  }
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }
}

async function convertDocxToPdf(inputPath: string, outputDir: string, profileDir?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    if (profileDir) {
      // Ensure a per-job profile to isolate concurrent soffice instances
      // Note: mkdir is async; we prepare the directory before calling this in POST, but safe to include here too
      // (we avoid awaiting here; POST ensures creation)
      args.push(`-env:UserInstallation=${pathToFileURL(profileDir).toString()}`);
    }
    args.push(
      '--headless',
      '--nologo',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      inputPath
    );
    const process = spawn('soffice', args);

    process.on('error', (error) => {
      reject(error);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`LibreOffice conversion failed with code ${code}`));
      }
    });
  });
}

async function waitForPdfReady(dir: string, timeoutMs = 20000, intervalMs = 100): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const files = await readdir(dir);
    const pdf = files.find(f => f.toLowerCase().endsWith('.pdf'));
    if (pdf) {
      const pdfPath = path.join(dir, pdf);
      try {
        const first = await stat(pdfPath);
        await new Promise((res) => setTimeout(res, intervalMs));
        const second = await stat(pdfPath);
        if (second.size > 0 && second.size === first.size) {
          return pdfPath;
        }
      } catch {
        // If stat fails (transient), continue polling
      }
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`PDF not ready in ${dir} after ${timeoutMs}ms`);
}

export async function POST(req: NextRequest) {
  try {
    await ensureTempDir();
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json(
        { error: 'File must be a .docx document' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempId = randomUUID();
    const jobDir = path.join(TEMP_DIR, tempId);
    await mkdir(jobDir, { recursive: true });
    const profileDir = path.join(jobDir, 'lo-profile');
    await mkdir(profileDir, { recursive: true });
    const inputPath = path.join(jobDir, 'input.docx');

    // Write the uploaded file
    await writeFile(inputPath, buffer);

    try {
      // Convert the file
      await convertDocxToPdf(inputPath, jobDir, profileDir);

      // Return the PDF file
      const pdfPath = await waitForPdfReady(jobDir);
      const pdfContent = await readFile(pdfPath);

      // Clean up temp files
      await rm(jobDir, { recursive: true, force: true }).catch(console.error);

      return new NextResponse(pdfContent, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${path.parse(file.name).name}.pdf"`
        }
      });
    } catch (error) {
      // Clean up temp files on error
      await rm(jobDir, { recursive: true, force: true }).catch(console.error);
      throw error;
    }
  } catch (error) {
    console.error('Error converting DOCX to PDF:', error);
    return NextResponse.json(
      { error: 'Failed to convert document' },
      { status: 500 }
    );
  }
}