import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readdir, readFile, rename, rm, stat, unlink, utimes, writeFile } from 'fs/promises';
import path from 'path';
import { decodeChapterTitleTag, encodeChapterFileName, encodeChapterTitleTag, ffprobeAudio } from '@/lib/server/audiobook';

export const DOCSTORE_DIR = path.join(process.cwd(), 'docstore');
export const DOCUMENTS_V1_DIR = path.join(DOCSTORE_DIR, 'documents_v1');
export const AUDIOBOOKS_V1_DIR = path.join(DOCSTORE_DIR, 'audiobooks_v1');

const MIGRATIONS_DIR = path.join(DOCSTORE_DIR, '.migrations');
const MIGRATIONS_STATE_PATH = path.join(MIGRATIONS_DIR, 'state.json');

type MigrationState = {
  documentsV1Migrated?: boolean;
  audiobooksV1Migrated?: boolean;
  updatedAt?: number;
};

type LegacyDocumentMetadata = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  type: string;
};

function isLegacyDocumentMetadata(value: unknown): value is LegacyDocumentMetadata {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.size === 'number' &&
    typeof v.lastModified === 'number' &&
    typeof v.type === 'string'
  );
}

async function loadMigrationState(): Promise<MigrationState> {
  try {
    return JSON.parse(await readFile(MIGRATIONS_STATE_PATH, 'utf8')) as MigrationState;
  } catch {
    return {};
  }
}

async function saveMigrationState(update: Partial<MigrationState>): Promise<void> {
  const state = await loadMigrationState();
  const next: MigrationState = {
    documentsV1Migrated: state.documentsV1Migrated,
    audiobooksV1Migrated: state.audiobooksV1Migrated,
    ...update,
    updatedAt: Date.now(),
  };
  await mkdir(MIGRATIONS_DIR, { recursive: true });
  await writeFile(MIGRATIONS_STATE_PATH, JSON.stringify(next, null, 2));
}

async function hasLegacyDocumentFiles(): Promise<boolean> {
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(DOCSTORE_DIR, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.json')) continue;

    const metadataPath = path.join(DOCSTORE_DIR, entry.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(metadataPath, 'utf8'));
    } catch {
      continue;
    }
    if (!isLegacyDocumentMetadata(parsed)) continue;

    const contentPath = path.join(DOCSTORE_DIR, `${parsed.id}.${parsed.type}`);
    if (!existsSync(contentPath)) continue;

    return true;
  }

  return false;
}

export async function isDocumentsV1Ready(): Promise<boolean> {
  if (!existsSync(DOCSTORE_DIR) || !existsSync(DOCUMENTS_V1_DIR)) return false;
  const state = await loadMigrationState();
  if (!state.documentsV1Migrated) return false;
  if (await hasLegacyDocumentFiles()) return false;
  return true;
}

function safeDocumentName(rawName: string, fallback: string): string {
  const baseName = path.basename(rawName || fallback);
  return baseName.replaceAll('\u0000', '').slice(0, 240) || fallback;
}

export function getMigratedDocumentFileName(id: string, name: string): string {
  const prefix = `${id}__`;
  const encodedName = encodeURIComponent(name);
  let targetFileName = `${prefix}${encodedName}`;

  // Ensure total filename length is within safe limits (e.g. 240 chars).
  // If too long, use a deterministic hash of the name instead of the full encoded name.
  if (targetFileName.length > 240) {
    const nameHash = createHash('sha256').update(name).digest('hex').slice(0, 32);
    targetFileName = `${prefix}truncated-${nameHash}`;
  }
  return targetFileName;
}

export type FSDocument = {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  filePath: string;
};

export async function scanDocumentsFS(): Promise<FSDocument[]> {
  if (!existsSync(DOCUMENTS_V1_DIR)) return [];

  const results: FSDocument[] = [];
  let files: string[] = [];
  try {
    files = await readdir(DOCUMENTS_V1_DIR);
  } catch {
    return [];
  }

  for (const file of files) {
    // Expected format: id__filename or id.ext (legacy fallback?)
    // Actually current format is id__encodedName
    const match = /^([a-f0-9]{64})__(.+)$/i.exec(file);
    if (!match) continue;

    const id = match[1];
    const encodedName = match[2];
    const name = decodeURIComponent(encodedName);
    const ext = path.extname(name).toLowerCase().replace('.', '');

    // Validate file exists and get stats
    try {
      const filePath = path.join(DOCUMENTS_V1_DIR, file);
      const stats = await stat(filePath);
      if (!stats.isFile()) continue;

      results.push({
        id,
        name,
        type: ext,
        size: stats.size,
        lastModified: Math.floor(stats.mtimeMs),
        filePath: file,
      });
    } catch {
      continue;
    }
  }

  return results;
}

export async function ensureDocumentsV1Ready(): Promise<boolean> {
  await mkdir(DOCSTORE_DIR, { recursive: true });
  await mkdir(DOCUMENTS_V1_DIR, { recursive: true });

  const state = await loadMigrationState();
  if (state.documentsV1Migrated && !(await hasLegacyDocumentFiles())) {
    return false;
  }

  if (!(await hasLegacyDocumentFiles())) {
    await saveMigrationState({ documentsV1Migrated: true });
    return false;
  }

  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(DOCSTORE_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.json')) continue;

    const metadataPath = path.join(DOCSTORE_DIR, entry.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(metadataPath, 'utf8'));
    } catch {
      continue;
    }
    if (!isLegacyDocumentMetadata(parsed)) continue;
    const metadata = parsed;

    const contentPath = path.join(DOCSTORE_DIR, `${metadata.id}.${metadata.type}`);
    let contentStat: Awaited<ReturnType<typeof stat>>;
    try {
      contentStat = await stat(contentPath);
    } catch {
      continue;
    }
    if (!contentStat.isFile()) continue;

    const content = await readFile(contentPath);
    const id = createHash('sha256').update(content).digest('hex');
    const fallbackName = `${id}.${metadata.type}`;
    const name = safeDocumentName(metadata.name, fallbackName);

    const targetFileName = getMigratedDocumentFileName(id, name);
    const targetPath = path.join(DOCUMENTS_V1_DIR, targetFileName);

    if (!existsSync(targetPath)) {
      await writeFile(targetPath, content);
      if (Number.isFinite(metadata.lastModified) && metadata.lastModified > 0) {
        const stamp = new Date(metadata.lastModified);
        await utimes(targetPath, stamp, stamp).catch(() => { });
      }
    }

    await unlink(metadataPath).catch(() => { });
    await unlink(contentPath).catch(() => { });
  }

  await saveMigrationState({ documentsV1Migrated: !(await hasLegacyDocumentFiles()) });
  return true;
}

async function hasLegacyAudiobookDirs(): Promise<boolean> {
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(DOCSTORE_DIR, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => entry.isDirectory() && entry.name.endsWith('-audiobook'));
}

async function hasLegacyAudiobookChapterLayout(): Promise<boolean> {
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(AUDIOBOOKS_V1_DIR, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('-audiobook')) continue;

    const dir = path.join(AUDIOBOOKS_V1_DIR, entry.name);
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      // Per-audiobook settings file is the new format; ignore it.
      if (file === 'audiobook.meta.json') continue;

      if (file.endsWith('.meta.json')) return true;
      if (/^\d+-chapter\.(mp3|m4b)$/i.test(file)) return true;
      if (/^[a-f0-9]{64}\.(mp3|m4b)$/i.test(file)) return true;
    }
  }

  return false;
}

export async function isAudiobooksV1Ready(): Promise<boolean> {
  if (!existsSync(DOCSTORE_DIR) || !existsSync(AUDIOBOOKS_V1_DIR)) return false;
  const state = await loadMigrationState();
  if (!state.audiobooksV1Migrated) return false;
  const legacyDirsPresent = await hasLegacyAudiobookDirs();
  const legacyChaptersPresent = await hasLegacyAudiobookChapterLayout();
  if (legacyDirsPresent || legacyChaptersPresent) return false;
  return true;
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
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

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

export async function ensureAudiobooksV1Ready(): Promise<boolean> {
  await mkdir(DOCSTORE_DIR, { recursive: true });
  await mkdir(AUDIOBOOKS_V1_DIR, { recursive: true });

  const state = await loadMigrationState();
  const legacyDirsPresent = await hasLegacyAudiobookDirs();
  const legacyChaptersPresent = await hasLegacyAudiobookChapterLayout();

  if (state.audiobooksV1Migrated && !legacyDirsPresent && !legacyChaptersPresent) {
    const stateRaw = state as unknown as Record<string, unknown>;
    const allowedKeys = new Set(['documentsV1Migrated', 'audiobooksV1Migrated', 'updatedAt']);
    const hasExtraKeys = Object.keys(stateRaw).some((key) => !allowedKeys.has(key));
    if (hasExtraKeys) {
      await saveMigrationState({ audiobooksV1Migrated: true });
    }
    return false;
  }

  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(DOCSTORE_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }

  if (legacyDirsPresent) {
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.endsWith('-audiobook')) continue;

      const sourceDir = path.join(DOCSTORE_DIR, entry.name);
      const targetDir = path.join(AUDIOBOOKS_V1_DIR, entry.name);

      try {
        if (!existsSync(targetDir)) {
          await rename(sourceDir, targetDir);
          continue;
        }

        await mkdir(targetDir, { recursive: true });
        await mergeDirectoryContents(sourceDir, targetDir);

        try {
          const remaining = await readdir(sourceDir);
          if (remaining.length === 0) {
            await rm(sourceDir);
          } else {
            console.warn(`Legacy audiobook dir not fully migrated (kept): ${sourceDir}`);
          }
        } catch { }
      } catch (error) {
        console.error('Error migrating legacy audiobook directory:', error);
        throw error;
      }
    }
  }

  if (legacyDirsPresent || legacyChaptersPresent) {
    await normalizeAudiobookChapterLayout();
  }

  const finalLegacyRemaining = await hasLegacyAudiobookDirs();
  const finalLegacyChaptersRemaining = await hasLegacyAudiobookChapterLayout();
  await saveMigrationState({ audiobooksV1Migrated: !finalLegacyRemaining && !finalLegacyChaptersRemaining });
  return true;
}

type LegacyChapterMeta = {
  title?: string;
  duration?: number;
  index?: number;
  format?: string;
};

async function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
    child.on('error', (err) => reject(err));
  });
}

async function rewriteAudioTitleTag(inputPath: string, outputPath: string, format: 'mp3' | 'm4b', titleTag: string): Promise<void> {
  const baseArgs = ['-y', '-i', inputPath, '-metadata', `title=${titleTag}`];
  if (format === 'mp3') {
    await runProcess('ffmpeg', [...baseArgs, '-c', 'copy', '-write_id3v2', '1', '-id3v2_version', '3', outputPath]);
    return;
  }
  await runProcess('ffmpeg', [...baseArgs, '-c', 'copy', '-f', 'mp4', outputPath]);
}

async function transcodeWithTitleTag(inputPath: string, outputPath: string, format: 'mp3' | 'm4b', titleTag: string): Promise<void> {
  if (format === 'mp3') {
    await runProcess('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      '-metadata',
      `title=${titleTag}`,
      outputPath,
    ]);
    return;
  }

  await runProcess('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-metadata',
    `title=${titleTag}`,
    '-f',
    'mp4',
    outputPath,
  ]);
}

async function normalizeAudiobookDirectoryChapterLayout(intermediateDir: string): Promise<void> {
  let files: string[] = [];
  try {
    files = await readdir(intermediateDir);
  } catch {
    return;
  }

  // Remove any combined output files from older layouts.
  await unlink(path.join(intermediateDir, 'complete.mp3')).catch(() => { });
  await unlink(path.join(intermediateDir, 'complete.m4b')).catch(() => { });
  await unlink(path.join(intermediateDir, 'metadata.txt')).catch(() => { });
  await unlink(path.join(intermediateDir, 'list.txt')).catch(() => { });

  const metaFiles = files.filter((file) => file.endsWith('.meta.json'));
  const migratedIndices = new Set<number>();

  for (const metaFile of metaFiles) {
    const metaPath = path.join(intermediateDir, metaFile);
    let metaRaw: unknown;
    try {
      metaRaw = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch {
      continue;
    }
    const meta = metaRaw as LegacyChapterMeta;
    const index = Number(meta.index);
    if (!Number.isFinite(index) || !Number.isInteger(index) || index < 0) continue;

    const format = meta.format === 'mp3' ? 'mp3' : 'm4b';
    const sourceAudio = path.join(intermediateDir, `${index}-chapter.${format}`);
    if (!existsSync(sourceAudio)) {
      await unlink(metaPath).catch(() => { });
      continue;
    }

    const titleTag = encodeChapterTitleTag(index, meta.title ?? `Chapter ${index + 1}`);
    const taggedTemp = path.join(intermediateDir, `${index}.tagged.tmp.${format}`);

    try {
      await rewriteAudioTitleTag(sourceAudio, taggedTemp, format, titleTag);
    } catch {
      await transcodeWithTitleTag(sourceAudio, taggedTemp, format, titleTag);
    }

    const finalName = encodeChapterFileName(index, meta.title ?? `Chapter ${index + 1}`, format);
    const finalPath = path.join(intermediateDir, finalName);
    await unlink(finalPath).catch(() => { });
    await rename(taggedTemp, finalPath);

    await unlink(sourceAudio).catch(() => { });
    await unlink(metaPath).catch(() => { });
    migratedIndices.add(index);
  }

  // Migrate any remaining legacy chapter files without metadata.
  files = await readdir(intermediateDir).catch(() => []);
  for (const file of files) {
    const match = /^(\d+)-chapter\.(mp3|m4b)$/i.exec(file);
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 0) continue;
    if (migratedIndices.has(index)) continue;

    const format = match[2].toLowerCase() as 'mp3' | 'm4b';
    const sourceAudio = path.join(intermediateDir, file);
    const titleTag = encodeChapterTitleTag(index, `Chapter ${index + 1}`);
    const taggedTemp = path.join(intermediateDir, `${index}.tagged.tmp.${format}`);

    try {
      await rewriteAudioTitleTag(sourceAudio, taggedTemp, format, titleTag);
    } catch {
      await transcodeWithTitleTag(sourceAudio, taggedTemp, format, titleTag);
    }

    const finalName = encodeChapterFileName(index, `Chapter ${index + 1}`, format);
    const finalPath = path.join(intermediateDir, finalName);
    await unlink(finalPath).catch(() => { });
    await rename(taggedTemp, finalPath);

    await unlink(sourceAudio).catch(() => { });
  }

  // Rename any sha-named chapter files from previous runs into the index__title scheme.
  files = await readdir(intermediateDir).catch(() => []);
  const shaCandidates = files.filter((file) => /^[a-f0-9]{64}\.(mp3|m4b)$/i.test(file));
  for (const file of shaCandidates) {
    const sourceAudio = path.join(intermediateDir, file);
    const format = file.toLowerCase().endsWith('.mp3') ? 'mp3' : 'm4b';

    let decoded: { index: number; title: string } | null = null;
    try {
      const probe = await ffprobeAudio(sourceAudio);
      decoded = probe.titleTag ? decodeChapterTitleTag(probe.titleTag) : null;
    } catch {
      decoded = null;
    }
    if (!decoded) continue;

    const finalName = encodeChapterFileName(decoded.index, decoded.title, format);
    const finalPath = path.join(intermediateDir, finalName);
    await unlink(finalPath).catch(() => { });
    await rename(sourceAudio, finalPath).catch(() => { });
  }

  // Remove any leftover input temp files.
  files = await readdir(intermediateDir).catch(() => []);
  for (const file of files) {
    if (/^\d+-input\.mp3$/i.test(file)) {
      await unlink(path.join(intermediateDir, file)).catch(() => { });
    }
    if (file.endsWith('.meta.json') && file !== 'audiobook.meta.json') {
      await unlink(path.join(intermediateDir, file)).catch(() => { });
    }
  }
}

async function normalizeAudiobookChapterLayout(): Promise<void> {
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await readdir(AUDIOBOOKS_V1_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('-audiobook')) continue;
    const dir = path.join(AUDIOBOOKS_V1_DIR, entry.name);
    try {
      await normalizeAudiobookDirectoryChapterLayout(dir);
    } catch (error) {
      console.error('Error migrating audiobook chapter layout:', error);
      throw error;
    }
  }
}
