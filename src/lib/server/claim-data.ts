import { db } from '@/db';
import { documents, audiobooks, audiobookChapters } from '@/db/schema';
import { eq, isNull, count } from 'drizzle-orm';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { DOCUMENTS_V1_DIR, AUDIOBOOKS_V1_DIR } from './docstore';
import { listStoredChapters } from './audiobook';

import { isAuthEnabled } from '@/lib/server/auth-config';

// Helper to check if a file is already indexed
async function isDocumentIndexed(id: string) {
  if (!isAuthEnabled() || !db) return false; // If no DB, assume not indexed or handle differently? 
  // Actually if no DB, we don't index into DB. So returning false is fine, 
  // but scanAndPopulateDB should probably return early if no DB.

  const result = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
  return result.length > 0;
}

async function isAudiobookIndexed(id: string) {
  if (!isAuthEnabled() || !db) return false;
  const result = await db.select({ id: audiobooks.id }).from(audiobooks).where(eq(audiobooks.id, id));
  return result.length > 0;
}

const UNCLAIMED_ID = 'unclaimed';

/**
 * Returns count of unclaimed documents and audiobooks in the DB (userId IS 'unclaimed')
 */
export async function getUnclaimedCounts() {
  if (!isAuthEnabled() || !db) return { documents: 0, audiobooks: 0 };
  const [docCount] = await db.select({ count: count() }).from(documents).where(eq(documents.userId, UNCLAIMED_ID));
  const [bookCount] = await db.select({ count: count() }).from(audiobooks).where(eq(audiobooks.userId, UNCLAIMED_ID));

  return {
    documents: docCount?.count ?? 0,
    audiobooks: bookCount?.count ?? 0
  };
}

export async function scanAndPopulateDB() {
  if (!isAuthEnabled() || !db) {
    console.log('Skipping DB population (Auth/DB disabled)');
    return { documents: 0, audiobooks: 0 };
  }

  console.log('Scanning file system for un-indexed content...');

  // 0. Fix legacy NULL userIds
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).update(documents).set({ userId: UNCLAIMED_ID }).where(isNull(documents.userId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).update(audiobooks).set({ userId: UNCLAIMED_ID }).where(isNull(audiobooks.userId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).update(audiobookChapters).set({ userId: UNCLAIMED_ID }).where(isNull(audiobookChapters.userId));
  } catch (err) {
    console.error('Error migrating legacy NULL userIds:', err);
  }

  // 1. Scan Documents
  if (existsSync(DOCUMENTS_V1_DIR)) {
    const files = await fs.readdir(DOCUMENTS_V1_DIR);
    for (const file of files) {
      const match = /^([a-f0-9]{64})__(.+)$/i.exec(file);
      if (!match) continue;

      const id = match[1];
      const encodedName = match[2];
      if (await isDocumentIndexed(id)) continue;

      let name: string;
      try {
        name = decodeURIComponent(encodedName);
      } catch {
        continue;
      }

      const filePath = path.join(DOCUMENTS_V1_DIR, file);
      const stats = await fs.stat(filePath);

      const ext = path.extname(name).toLowerCase().replace('.', '');

      await db.insert(documents).values({
        id,
        userId: UNCLAIMED_ID,
        name,
        type: ext,
        size: stats.size,
        lastModified: Math.floor(stats.mtimeMs),
        filePath: file,
      });
      console.log(`Indexed document: ${name} (${id})`);
    }
  }

  // 2. Scan Audiobooks
  if (existsSync(AUDIOBOOKS_V1_DIR)) {
    const entries = await fs.readdir(AUDIOBOOKS_V1_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.endsWith('-audiobook')) continue;

      const bookId = entry.name.replace('-audiobook', '');
      if (await isAudiobookIndexed(bookId)) continue;

      const dirPath = path.join(AUDIOBOOKS_V1_DIR, entry.name);

      let title = `Unknown Title`;

      try {
        const metaPath = path.join(dirPath, 'audiobook.meta.json');
        const metaContent = await fs.readFile(metaPath, 'utf8');
        JSON.parse(metaContent); // validating json
      } catch { }

      const chapters = await listStoredChapters(dirPath);
      const totalDuration = chapters.reduce((acc, c) => acc + (c.durationSec || 0), 0);

      if (chapters.length > 0) {
        title = chapters[0].title || title;
      }

      await db.insert(audiobooks).values({
        id: bookId,
        userId: UNCLAIMED_ID,
        title: title,
        duration: totalDuration,
      });
      console.log(`Indexed audiobook: ${bookId}`);

      for (const chapter of chapters) {
        await db.insert(audiobookChapters).values({
          id: `${bookId}-${chapter.index}`,
          bookId: bookId,
          userId: UNCLAIMED_ID,
          chapterIndex: chapter.index,
          title: chapter.title,
          duration: chapter.durationSec || 0,
          filePath: chapter.filePath,
          format: chapter.format
        })
      }
    }
  }

  // Return current unclaimed counts (includes newly indexed + previously unclaimed)
  return getUnclaimedCounts();
}

export async function claimAnonymousData(userId: string) {
  if (!isAuthEnabled() || !db || !userId) return { documents: 0, audiobooks: 0 };

  // Update Documents
  const docResult = await db.update(documents)
    .set({ userId })
    .where(eq(documents.userId, UNCLAIMED_ID))
    .returning({ id: documents.id }); // If supported by driver, otherwise use run and check changes

  // Update Audiobooks
  const bookResult = await db.update(audiobooks)
    .set({ userId })
    .where(eq(audiobooks.userId, UNCLAIMED_ID))
    .returning({ id: audiobooks.id });

  // Update Chapters (denormalized userId)
  await db.update(audiobookChapters)
    .set({ userId })
    .where(eq(audiobookChapters.userId, UNCLAIMED_ID)); // Or match by bookId join

  return {
    documents: docResult.length,
    audiobooks: bookResult.length
  };
}
