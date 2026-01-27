import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { mkdir, readdir, rename, rm } from 'fs/promises';
import { join } from 'path';
import {
  AUDIOBOOKS_V1_DIR,
  ensureAudiobooksV1Ready,
  ensureDocumentsV1Ready,
  isAudiobooksV1Ready,
  isDocumentsV1Ready,
} from '@/lib/server/docstore';
import { auth } from '@/lib/server/auth';

type Mapping = { oldId: string; id: string };

function isSafeId(value: string): boolean {
  return /^[a-zA-Z0-9._-]{1,128}$/.test(value);
}

async function mergeDirectoryContents(sourceDir: string, targetDir: string): Promise<{ moved: number; skipped: number }> {
  let moved = 0;
  let skipped = 0;

  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    return { moved, skipped };
  }

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      const nested = await mergeDirectoryContents(sourcePath, targetPath);
      moved += nested.moved;
      skipped += nested.skipped;

      try {
        const remaining = await readdir(sourcePath);
        if (remaining.length === 0) {
          await rm(sourcePath);
        }
      } catch { }
      continue;
    }

    if (!entry.isFile()) continue;

    if (existsSync(targetPath)) {
      skipped++;
      continue;
    }

    try {
      await rename(sourcePath, targetPath);
      moved++;
    } catch {
      skipped++;
    }
  }

  return { moved, skipped };
}

async function rekeyAudiobooksV1(mappings: Mapping[]): Promise<{ renamed: number; merged: number; skipped: number }> {
  let renamed = 0;
  let merged = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    if (mapping.oldId === mapping.id) continue;
    const sourceDir = join(AUDIOBOOKS_V1_DIR, `${mapping.oldId}-audiobook`);
    if (!existsSync(sourceDir)) continue;

    const targetDir = join(AUDIOBOOKS_V1_DIR, `${mapping.id}-audiobook`);
    if (!existsSync(targetDir)) {
      try {
        await rename(sourceDir, targetDir);
        renamed++;
        continue;
      } catch {
        // Fall through to merge.
      }
    }

    await mkdir(targetDir, { recursive: true });
    const res = await mergeDirectoryContents(sourceDir, targetDir);
    if (res.moved > 0) merged++;
    skipped += res.skipped;

    try {
      const remaining = await readdir(sourceDir);
      if (remaining.length === 0) {
        await rm(sourceDir);
      }
    } catch { }
  }

  return { renamed, merged, skipped };
}

export async function POST(request: NextRequest) {
  try {
    // Auth check - require session
    const session = await auth?.api.getSession({ headers: request.headers });
    if (auth && !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = (await request.json().catch(() => null)) as { mappings?: Mapping[] } | null;
    const mappings = (raw?.mappings ?? []).filter(
      (m): m is Mapping => Boolean(m && typeof m.oldId === 'string' && typeof m.id === 'string'),
    );

    for (const mapping of mappings) {
      if (!isSafeId(mapping.oldId) || !isSafeId(mapping.id)) {
        return NextResponse.json({ error: 'Invalid document id mapping' }, { status: 400 });
      }
    }

    const documentsMigrated = await ensureDocumentsV1Ready();
    const audiobooksMigrated = await ensureAudiobooksV1Ready();
    const rekey = await rekeyAudiobooksV1(mappings);

    const documentsReady = await isDocumentsV1Ready();
    const audiobooksReady = await isAudiobooksV1Ready();

    return NextResponse.json({
      success: true,
      documentsReady,
      audiobooksReady,
      documentsMigrated,
      audiobooksMigrated,
      rekey,
    });
  } catch (error) {
    console.error('Error running v1 migrations:', error);
    return NextResponse.json({ error: 'Failed to run v1 migrations' }, { status: 500 });
  }
}

