import path from 'path';
import { utimes } from 'fs/promises';
import type { DocumentType } from '@/types/documents';

export function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}

export function safeDocumentName(rawName: string, fallback: string): string {
  const baseName = path.basename(rawName || fallback);
  return baseName.replaceAll('\u0000', '').slice(0, 240) || fallback;
}

export function toDocumentTypeFromName(name: string): DocumentType {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.epub') return 'epub';
  if (ext === '.docx') return 'docx';
  return 'html';
}

export async function trySetFileMtime(filePath: string, lastModifiedMs: number): Promise<void> {
  if (!Number.isFinite(lastModifiedMs)) return;
  const mtime = new Date(lastModifiedMs);
  if (Number.isNaN(mtime.getTime())) return;

  try {
    await utimes(filePath, mtime, mtime);
  } catch (error) {
    console.warn('Failed to set document mtime:', filePath, error);
  }
}

