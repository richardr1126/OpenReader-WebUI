import { spawn } from 'child_process';
import path from 'path';
import { readdir, readFile } from 'fs/promises';

export type StoredChapter = {
  index: number;
  title: string;
  durationSec?: number;
  format: 'mp3' | 'm4b';
  filePath: string;
};

function sanitizeTagValue(value: string): string {
  return value.replaceAll('\u0000', '').replaceAll(/\r?\n/g, ' ').trim();
}

function sanitizeFileStem(value: string): string {
  return sanitizeTagValue(value)
    .replaceAll(/[\\/]/g, ' ')
    .replaceAll(/[<>:"|?*\u0000]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function escapeFFMetadata(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/;/g, '\\;')
    .replace(/#/g, '\\#')
    .replace(/\r|\n/g, ' ');
}

export function encodeChapterTitleTag(index: number, title: string): string {
  const safeTitle = sanitizeTagValue(title) || `Chapter ${index + 1}`;
  const prefix = String(index + 1).padStart(4, '0');
  return `${prefix} - ${safeTitle}`;
}

export function decodeChapterTitleTag(tag: string): { index: number; title: string } | null {
  const raw = sanitizeTagValue(tag);
  if (!raw) return null;

  const match = /^(\d{1,6})\s*[-.:]\s*(.+)$/.exec(raw);
  if (!match) return null;

  const oneBased = Number(match[1]);
  if (!Number.isFinite(oneBased) || !Number.isInteger(oneBased) || oneBased <= 0) return null;

  return { index: oneBased - 1, title: match[2].trim() || `Chapter ${oneBased}` };
}

export function encodeChapterFileName(index: number, title: string, format: 'mp3' | 'm4b'): string {
  const oneBased = String(index + 1).padStart(4, '0');
  const safeTitle = sanitizeFileStem(title) || `Chapter ${index + 1}`;
  return `${oneBased}__${encodeURIComponent(safeTitle)}.${format}`;
}

export function decodeChapterFileName(fileName: string): { index: number; title: string; format: 'mp3' | 'm4b' } | null {
  const match = /^(\d{1,6})__(.+)\.(mp3|m4b)$/i.exec(fileName);
  if (!match) return null;
  const oneBased = Number(match[1]);
  if (!Number.isInteger(oneBased) || oneBased <= 0) return null;
  const format = match[3].toLowerCase() as 'mp3' | 'm4b';
  try {
    const title = decodeURIComponent(match[2]);
    return { index: oneBased - 1, title: title || `Chapter ${oneBased}`, format };
  } catch {
    return { index: oneBased - 1, title: match[2], format };
  }
}

type ProbeResult = {
  durationSec?: number;
  titleTag?: string;
};

export async function ffprobeAudio(filePath: string, signal?: AbortSignal): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_entries',
      'format=duration:format_tags=title',
      filePath,
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
      if (code !== 0) {
        reject(new Error(`ffprobe process exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(output) as {
          format?: { duration?: string; tags?: { title?: string } };
        };
        const durationStr = parsed.format?.duration;
        const durationSec = durationStr ? Number(durationStr) : undefined;
        resolve({
          durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
          titleTag: parsed.format?.tags?.title,
        });
      } catch (error) {
        reject(error);
      }
    });

    ffprobe.on('error', (err) => {
      if (finished) return;
      cleanup();
      reject(err);
    });
  });
}

export async function listStoredChapters(dir: string, signal?: AbortSignal): Promise<StoredChapter[]> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const candidates = files.filter((file) => !file.startsWith('.')).filter((file) => !file.startsWith('complete.'));

  const results: StoredChapter[] = [];
  for (const file of candidates) {
    const decodedFromName = decodeChapterFileName(file);
    if (!decodedFromName) continue;

    const filePath = path.join(dir, file);

    // Try reading cached duration first to avoid ffprobe calls
    const durationPath = path.join(dir, `${decodedFromName.index}.duration`);
    let durationSec: number | undefined;
    try {
      const cached = await readFile(durationPath, 'utf8');
      const parsed = parseFloat(cached);
      if (Number.isFinite(parsed) && parsed > 0) {
        durationSec = parsed;
      }
    } catch {}

    // Only ffprobe if no cached duration
    if (durationSec === undefined) {
      try {
        const probe = await ffprobeAudio(filePath, signal);
        durationSec = probe.durationSec;
      } catch {}
    }

    results.push({
      index: decodedFromName.index,
      title: decodedFromName.title,
      durationSec,
      format: decodedFromName.format,
      filePath,
    });
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

export async function findStoredChapterByIndex(
  dir: string,
  index: number,
  signal?: AbortSignal,
): Promise<StoredChapter | null> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }

  const oneBasedPrefix = String(index + 1).padStart(4, '0') + '__';
  const candidate = files.find((file) => file.startsWith(oneBasedPrefix) && (file.endsWith('.mp3') || file.endsWith('.m4b')));
  if (!candidate) {
    const chapters = await listStoredChapters(dir, signal);
    return chapters.find((chapter) => chapter.index === index) ?? null;
  }

  const decoded = decodeChapterFileName(candidate);
  if (!decoded) return null;

  const filePath = path.join(dir, candidate);

  // Try reading cached duration first
  const durationPath = path.join(dir, `${decoded.index}.duration`);
  let durationSec: number | undefined;
  try {
    const cached = await readFile(durationPath, 'utf8');
    const parsed = parseFloat(cached);
    if (Number.isFinite(parsed) && parsed > 0) {
      durationSec = parsed;
    }
  } catch {}

  // Only ffprobe if no cached duration
  if (durationSec === undefined) {
    try {
      const probe = await ffprobeAudio(filePath, signal);
      durationSec = probe.durationSec;
    } catch {}
  }

  return {
    index: decoded.index,
    title: decoded.title,
    durationSec,
    format: decoded.format,
    filePath,
  };
}
