import { db } from '@/db';
import { documents, audiobooks, audiobookChapters } from '@/db/schema';
import { eq, and, count } from 'drizzle-orm';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { 
  DOCUMENTS_V1_DIR, 
  AUDIOBOOKS_V1_DIR, 
  UNCLAIMED_USER_ID,
  getUnclaimedAudiobookDir,
  getUserAudiobookDir,
  moveAudiobookToUser,
  listUserAudiobookIds
} from './docstore';
import { listStoredChapters } from './audiobook';

import { isAuthEnabled } from '@/lib/server/auth-config';

// Helper to check if a document is already indexed
async function isDocumentIndexed(id: string) {
  if (!isAuthEnabled() || !db) return false;
  const result = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
  return result.length > 0;
}

// Helper to check if an audiobook is indexed for a specific user (composite PK)
async function isAudiobookIndexedForUser(id: string, userId: string) {
  if (!isAuthEnabled() || !db) return false;
  const result = await db.select({ id: audiobooks.id }).from(audiobooks).where(
    and(eq(audiobooks.id, id), eq(audiobooks.userId, userId))
  );
  return result.length > 0;
}

/**
 * Returns count of unclaimed documents and audiobooks in the DB (userId IS 'unclaimed')
 */
export async function getUnclaimedCounts() {
  if (!isAuthEnabled() || !db) return { documents: 0, audiobooks: 0 };
  const [docCount] = await db.select({ count: count() }).from(documents).where(eq(documents.userId, UNCLAIMED_USER_ID));
  const [bookCount] = await db.select({ count: count() }).from(audiobooks).where(eq(audiobooks.userId, UNCLAIMED_USER_ID));

  return {
    documents: docCount?.count ?? 0,
    audiobooks: bookCount?.count ?? 0
  };
}

/**
 * Migrate legacy audiobooks from AUDIOBOOKS_V1_DIR to the unclaimed user folder.
 * This handles the case where audiobooks were created before the per-user storage refactor.
 */
async function migrateLegacyAudiobooksToUnclaimed(): Promise<number> {
  if (!existsSync(AUDIOBOOKS_V1_DIR)) return 0;

  const unclaimedDir = getUnclaimedAudiobookDir();
  await fs.mkdir(unclaimedDir, { recursive: true });

  const entries = await fs.readdir(AUDIOBOOKS_V1_DIR, { withFileTypes: true });
  let migrated = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('-audiobook')) continue;

    const sourceDir = path.join(AUDIOBOOKS_V1_DIR, entry.name);
    const targetDir = path.join(unclaimedDir, entry.name);

    // Skip if already exists in unclaimed
    if (existsSync(targetDir)) continue;

    try {
      await fs.rename(sourceDir, targetDir);
      migrated++;
      console.log(`Migrated legacy audiobook to unclaimed: ${entry.name}`);
    } catch (err) {
      console.error(`Error migrating legacy audiobook ${entry.name}:`, err);
    }
  }

  return migrated;
}

export async function scanAndPopulateDB() {
  if (!isAuthEnabled() || !db) {
    console.log('Skipping DB population (Auth/DB disabled)');
    return { documents: 0, audiobooks: 0 };
  }

  console.log('Scanning file system for un-indexed content...');

  // 0. Migrate legacy audiobooks from AUDIOBOOKS_V1_DIR to unclaimed folder
  await migrateLegacyAudiobooksToUnclaimed();

  // 1. Scan Documents (unchanged - documents use shared storage)
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
        userId: UNCLAIMED_USER_ID,
        name,
        type: ext,
        size: stats.size,
        lastModified: Math.floor(stats.mtimeMs),
        filePath: file,
      });
      console.log(`Indexed document: ${name} (${id})`);
    }
  }

  // 2. Scan Audiobooks from unclaimed folder
  const unclaimedDir = getUnclaimedAudiobookDir();
  if (existsSync(unclaimedDir)) {
    const entries = await fs.readdir(unclaimedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.endsWith('-audiobook')) continue;

      const bookId = entry.name.replace('-audiobook', '');
      if (await isAudiobookIndexedForUser(bookId, UNCLAIMED_USER_ID)) continue;

      const dirPath = path.join(unclaimedDir, entry.name);

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
        userId: UNCLAIMED_USER_ID,
        title: title,
        duration: totalDuration,
      });
      console.log(`Indexed audiobook: ${bookId}`);

      for (const chapter of chapters) {
        await db.insert(audiobookChapters).values({
          id: `${bookId}-${chapter.index}`,
          bookId: bookId,
          userId: UNCLAIMED_USER_ID,
          chapterIndex: chapter.index,
          title: chapter.title,
          duration: chapter.durationSec || 0,
          filePath: chapter.filePath,
          format: chapter.format
        });
      }
    }
  }

  // Return current unclaimed counts (includes newly indexed + previously unclaimed)
  return getUnclaimedCounts();
}

export async function claimAnonymousData(userId: string) {
  if (!isAuthEnabled() || !db || !userId) return { documents: 0, audiobooks: 0 };

  // Get list of unclaimed audiobook IDs before updating DB
  const unclaimedBookIds = await listUserAudiobookIds(UNCLAIMED_USER_ID);

  // Update Documents - documents use shared storage, only DB update needed
  const docResult = await db.update(documents)
    .set({ userId })
    .where(eq(documents.userId, UNCLAIMED_USER_ID))
    .returning({ id: documents.id });

  // For audiobooks, we need to:
  // 1. Move the physical folders from unclaimed to user's folder
  // 2. Update the DB records

  let audiobooksClaimedCount = 0;
  const userDir = getUserAudiobookDir(userId);
  await fs.mkdir(userDir, { recursive: true });

  for (const bookId of unclaimedBookIds) {
    try {
      // Move the audiobook folder
      const moved = await moveAudiobookToUser(bookId, UNCLAIMED_USER_ID, userId);
      if (moved) {
        // Update DB - delete old record and insert new one (composite PK requires this)
        const [oldRecord] = await db.select().from(audiobooks).where(
          and(eq(audiobooks.id, bookId), eq(audiobooks.userId, UNCLAIMED_USER_ID))
        );

        if (oldRecord) {
          // Get chapters
          const oldChapters = await db.select().from(audiobookChapters).where(
            and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, UNCLAIMED_USER_ID))
          );

          // Delete old records
          await db.delete(audiobookChapters).where(
            and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, UNCLAIMED_USER_ID))
          );
          await db.delete(audiobooks).where(
            and(eq(audiobooks.id, bookId), eq(audiobooks.userId, UNCLAIMED_USER_ID))
          );

          // Insert new records with new userId
          await db.insert(audiobooks).values({
            ...oldRecord,
            userId,
          });

          for (const chapter of oldChapters) {
            await db.insert(audiobookChapters).values({
              ...chapter,
              userId,
            });
          }

          audiobooksClaimedCount++;
          console.log(`Claimed audiobook: ${bookId}`);
        }
      }
    } catch (err) {
      console.error(`Error claiming audiobook ${bookId}:`, err);
    }
  }

  return {
    documents: docResult.length,
    audiobooks: audiobooksClaimedCount
  };
}

/**
 * Transfer audiobooks from one user to another.
 * Used when an anonymous user creates a real account.
 * @returns number of audiobooks transferred
 */
export async function transferUserAudiobooks(fromUserId: string, toUserId: string): Promise<number> {
  if (!isAuthEnabled() || !db || !fromUserId || !toUserId) return 0;

  const bookIds = await listUserAudiobookIds(fromUserId);
  let transferred = 0;

  const toUserDir = getUserAudiobookDir(toUserId);
  await fs.mkdir(toUserDir, { recursive: true });

  for (const bookId of bookIds) {
    try {
      // Move the audiobook folder
      const moved = await moveAudiobookToUser(bookId, fromUserId, toUserId);
      if (moved) {
        // Update DB - delete old record and insert new one (composite PK)
        const [oldRecord] = await db.select().from(audiobooks).where(
          and(eq(audiobooks.id, bookId), eq(audiobooks.userId, fromUserId))
        );

        if (oldRecord) {
          // Get chapters
          const oldChapters = await db.select().from(audiobookChapters).where(
            and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, fromUserId))
          );

          // Delete old records
          await db.delete(audiobookChapters).where(
            and(eq(audiobookChapters.bookId, bookId), eq(audiobookChapters.userId, fromUserId))
          );
          await db.delete(audiobooks).where(
            and(eq(audiobooks.id, bookId), eq(audiobooks.userId, fromUserId))
          );

          // Insert new records with new userId
          await db.insert(audiobooks).values({
            ...oldRecord,
            userId: toUserId,
          });

          for (const chapter of oldChapters) {
            await db.insert(audiobookChapters).values({
              ...chapter,
              userId: toUserId,
            });
          }

          transferred++;
          console.log(`Transferred audiobook ${bookId} from ${fromUserId} to ${toUserId}`);
        }
      }
    } catch (err) {
      console.error(`Error transferring audiobook ${bookId}:`, err);
    }
  }

  return transferred;
}
