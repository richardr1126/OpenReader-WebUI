import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readdir, readFile, stat, unlink } from 'fs/promises';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { auth } from '@/lib/server/auth';
import { DOCUMENTS_V1_DIR } from '@/lib/server/docstore';
import { isValidDocumentId, putDocumentBlob } from '@/lib/server/documents-blobstore';
import { toDocumentTypeFromName } from '@/lib/server/documents-utils';
import { contentTypeForName } from '@/lib/server/library';
import { isS3Configured } from '@/lib/server/s3';
import type { DocumentType } from '@/types/documents';
import {
  applyOpenReaderTestNamespacePath,
  getOpenReaderTestNamespace,
  getUnclaimedUserIdForNamespace,
} from '@/lib/server/test-namespace';

export const dynamic = 'force-dynamic';

type V2Body = {
  deleteLocal?: boolean;
  dryRun?: boolean;
};

type LegacyDocumentCandidate = {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return maybe.$metadata?.httpStatusCode === 412 || maybe.name === 'PreconditionFailed';
}

function extractIdFromFileName(fileName: string): string | null {
  const match = /^([a-f0-9]{64})__/i.exec(fileName);
  if (!match) return null;
  const id = match[1].toLowerCase();
  return isValidDocumentId(id) ? id : null;
}

function decodeNameFromFileName(fileName: string, id: string): string {
  const prefix = `${id}__`;
  if (!fileName.startsWith(prefix)) return `${id}.bin`;
  const encoded = fileName.slice(prefix.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return `${id}.bin`;
  }
}

function sniffBinaryDocumentType(bytes: Buffer): Exclude<DocumentType, 'html'> | null {
  // PDF signature: "%PDF-"
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'pdf';
  }

  // ZIP signatures: PK..
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
  if (!isZip) return null;

  // EPUB/DOCX markers usually appear in ZIP local headers near the start.
  const probe = bytes.subarray(0, Math.min(bytes.length, 1024 * 1024)).toString('latin1');
  if (probe.includes('application/epub+zip') || probe.includes('META-INF/container.xml')) {
    return 'epub';
  }
  if (probe.includes('[Content_Types].xml') && probe.includes('word/')) {
    return 'docx';
  }

  return null;
}

function normalizeNameForType(name: string, id: string, type: DocumentType): string {
  if (type === 'html') return name;
  const expectedExt = type === 'pdf' ? '.pdf' : type === 'epub' ? '.epub' : '.docx';
  if (name.toLowerCase().endsWith(expectedExt)) return name;
  const base = name.replace(/\.bin$/i, '');
  return `${base || id}${expectedExt}`;
}

function contentTypeForDocument(type: DocumentType, name: string): string {
  if (type === 'pdf') return 'application/pdf';
  if (type === 'epub') return 'application/epub+zip';
  if (type === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return contentTypeForName(name);
}

async function migrateDocumentRowsToBlobHandle(dryRun: boolean): Promise<number> {
  const rows = (await db.select().from(documents)) as Array<{
    id: string;
    userId: string;
    filePath: string;
  }>;

  let updated = 0;
  for (const row of rows) {
    if (!row.id || !row.userId || row.filePath === row.id) continue;
    updated++;
    if (dryRun) continue;
    await db
      .update(documents)
      .set({ filePath: row.id })
      .where(and(eq(documents.id, row.id), eq(documents.userId, row.userId)));
  }
  return updated;
}

async function seedMissingDocumentRows(
  userId: string,
  candidates: LegacyDocumentCandidate[],
  dryRun: boolean,
): Promise<number> {
  if (candidates.length === 0) return 0;

  const existingRows = (await db.select().from(documents).where(eq(documents.userId, userId))) as Array<{
    id: string;
  }>;
  const existingIds = new Set(existingRows.map((row) => row.id));

  const seen = new Set<string>();
  const toInsert: LegacyDocumentCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (existingIds.has(candidate.id)) continue;
    toInsert.push(candidate);
  }

  if (toInsert.length === 0) return 0;
  if (dryRun) return toInsert.length;

  await db.insert(documents).values(
    toInsert.map((candidate) => ({
      id: candidate.id,
      userId,
      name: candidate.name,
      type: candidate.type,
      size: candidate.size,
      lastModified: candidate.lastModified,
      filePath: candidate.id,
    })),
  ).onConflictDoNothing();

  return toInsert.length;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth?.api.getSession({ headers: request.headers });
    if (auth && !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { error: 'S3 is not configured. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.' },
        { status: 409 },
      );
    }

    const raw = (await request.json().catch(() => ({}))) as V2Body;
    const dryRun = raw.dryRun === true;
    const deleteLocal = raw.deleteLocal === true;
    const testNamespace = getOpenReaderTestNamespace(request.headers);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);
    const docsDir = applyOpenReaderTestNamespacePath(DOCUMENTS_V1_DIR, testNamespace);

    if (!existsSync(docsDir)) {
      const rowsUpdated = await migrateDocumentRowsToBlobHandle(dryRun);
      return NextResponse.json({
        success: true,
        dryRun,
        deleteLocal,
        docsDir,
        filesScanned: 0,
        uploaded: 0,
        alreadyPresent: 0,
        skippedInvalid: 0,
        deletedLocal: 0,
        dbRowsUpdated: rowsUpdated,
        dbRowsSeeded: 0,
      });
    }

    const entries = await readdir(docsDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

    let uploaded = 0;
    let alreadyPresent = 0;
    let skippedInvalid = 0;
    let deletedLocal = 0;
    const candidates: LegacyDocumentCandidate[] = [];

    for (const fileName of files) {
      const fullPath = path.join(docsDir, fileName);
      const bytes = await readFile(fullPath);
      const fileStats = await stat(fullPath);

      const extractedId = extractIdFromFileName(fileName);
      const id = extractedId ?? createHash('sha256').update(bytes).digest('hex');
      if (!isValidDocumentId(id)) {
        skippedInvalid++;
        continue;
      }

      const inferredName = decodeNameFromFileName(fileName, id);
      const inferredType = toDocumentTypeFromName(inferredName);
      const type = inferredType === 'html' ? (sniffBinaryDocumentType(bytes) ?? inferredType) : inferredType;
      const normalizedName = normalizeNameForType(inferredName, id, type);
      const contentType = contentTypeForDocument(type, normalizedName);
      const lastModified = Number.isFinite(fileStats.mtimeMs) ? Math.floor(fileStats.mtimeMs) : Date.now();

      candidates.push({
        id,
        name: normalizedName,
        type,
        size: bytes.length,
        lastModified,
      });

      if (!dryRun) {
        try {
          await putDocumentBlob(id, bytes, contentType, testNamespace);
          uploaded++;
        } catch (error) {
          if (isPreconditionFailed(error)) {
            alreadyPresent++;
          } else {
            throw error;
          }
        }
      }

      if (deleteLocal && !dryRun) {
        await unlink(fullPath).catch(() => {});
        deletedLocal++;
      }
    }

    const rowsUpdated = await migrateDocumentRowsToBlobHandle(dryRun);
    const rowsSeeded = await seedMissingDocumentRows(unclaimedUserId, candidates, dryRun);

    return NextResponse.json({
      success: true,
      dryRun,
      deleteLocal,
      docsDir,
      filesScanned: files.length,
      uploaded,
      alreadyPresent,
      skippedInvalid,
      deletedLocal,
      dbRowsUpdated: rowsUpdated,
      dbRowsSeeded: rowsSeeded,
    });
  } catch (error) {
    console.error('Error running v2 migrations:', error);
    return NextResponse.json({ error: 'Failed to run v2 migrations' }, { status: 500 });
  }
}
