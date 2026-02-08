import { db } from '@/db';
import { documents, audiobooks, audiobookChapters } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import {
  UNCLAIMED_USER_ID,
  getUserAudiobookDir,
  moveAudiobookToUser,
  listUserAudiobookIds,
} from './docstore';

import { isAuthEnabled } from '@/lib/server/auth-config';

export async function claimAnonymousData(userId: string) {
  if (!isAuthEnabled() || !userId) return { documents: 0, audiobooks: 0 };

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
 * Transfer documents from one userId to another.
 *
 * This is used when an anonymous user upgrades to an authenticated account.
 * The underlying blob storage is shared (by sha), so this only moves metadata rows.
 *
 * @returns number of document rows transferred
 */
export async function transferUserDocuments(
  fromUserId: string,
  toUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: { db?: any },
): Promise<number> {
  if (!isAuthEnabled() || !fromUserId || !toUserId) return 0;
  if (fromUserId === toUserId) return 0;

  const database = options?.db ?? db;

  const rows = await database.select().from(documents).where(eq(documents.userId, fromUserId));
  if (rows.length === 0) return 0;

  await database
    .insert(documents)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values(rows.map((row: any) => ({ ...row, userId: toUserId })))
    .onConflictDoNothing();

  await database.delete(documents).where(eq(documents.userId, fromUserId));
  return rows.length;
}

/**
 * Transfer audiobooks from one user to another.
 * Used when an anonymous user creates a real account.
 * @returns number of audiobooks transferred
 */
export async function transferUserAudiobooks(fromUserId: string, toUserId: string): Promise<number> {
  if (!isAuthEnabled() || !fromUserId || !toUserId) return 0;

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
