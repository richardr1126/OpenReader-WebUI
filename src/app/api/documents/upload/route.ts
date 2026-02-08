import { createHash } from 'crypto';
import { mkdir, stat, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { ensureDocumentsV1Ready, isDocumentsV1Ready, DOCUMENTS_V1_DIR } from '@/lib/server/docstore';
import { requireAuthContext } from '@/lib/server/auth';
import { safeDocumentName, toDocumentTypeFromName, trySetFileMtime } from '@/lib/server/documents-utils';
import { applyOpenReaderTestNamespacePath, getOpenReaderTestNamespace, getUnclaimedUserIdForNamespace } from '@/lib/server/test-namespace';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDocumentsV1Ready();
    if (!(await isDocumentsV1Ready())) {
      return NextResponse.json(
        { error: 'Documents storage is not migrated; run /api/migrations/v1 first.' },
        { status: 409 },
      );
    }

    const testNamespace = getOpenReaderTestNamespace(req.headers);
    const documentsDir = applyOpenReaderTestNamespacePath(DOCUMENTS_V1_DIR, testNamespace);
    const unclaimedUserId = getUnclaimedUserIdForNamespace(testNamespace);
    await mkdir(documentsDir, { recursive: true });

    const ctxOrRes = await requireAuthContext(req);
    if (ctxOrRes instanceof Response) return ctxOrRes;
    const storageUserId = ctxOrRes.userId ?? unclaimedUserId;

    const form = await req.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'Missing files' }, { status: 400 });
    }

    const stored: Array<{
      id: string;
      name: string;
      type: 'pdf' | 'epub' | 'docx' | 'html';
      size: number;
      lastModified: number;
    }> = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const content = Buffer.from(new Uint8Array(arrayBuffer));
      const id = createHash('sha256').update(content).digest('hex');

      const safeName = safeDocumentName(file.name, `${id}.${toDocumentTypeFromName(file.name)}`);
      const targetFileName = `${id}__${encodeURIComponent(safeName)}`;
      const targetPath = path.join(documentsDir, targetFileName);

      try {
        await stat(targetPath);
      } catch {
        await writeFile(targetPath, content);
      }

      const lastModified = Number.isFinite(file.lastModified) ? file.lastModified : Date.now();
      await trySetFileMtime(targetPath, lastModified);

      const type = toDocumentTypeFromName(safeName);

      await db
        .insert(documents)
        .values({
          id,
          userId: storageUserId,
          name: safeName,
          type,
          size: content.length,
          lastModified,
          filePath: targetFileName,
        })
        .onConflictDoNothing();

      stored.push({
        id,
        name: safeName,
        type,
        size: content.length,
        lastModified,
      });
    }

    return NextResponse.json({ stored });
  } catch (error) {
    console.error('Error uploading documents:', error);
    return NextResponse.json({ error: 'Failed to upload documents' }, { status: 500 });
  }
}
