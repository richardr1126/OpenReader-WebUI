import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { isAuthEnabled } from '@/lib/server/auth-config';
import { db } from '@/db';
import { audiobookChapters, audiobooks, documents } from '@/db/schema';
import { and, count, eq } from 'drizzle-orm';
import { listStoredChapters } from '@/lib/server/audiobook';
import { AUDIOBOOKS_V1_DIR, DOCUMENTS_V1_DIR, UNCLAIMED_USER_ID, getUnclaimedAudiobookDir } from '@/lib/server/docstore';

const DOCSTORE_DIR = path.join(process.cwd(), 'docstore');
const MIGRATIONS_DIR = path.join(DOCSTORE_DIR, '.migrations');
const STATE_PATH = path.join(MIGRATIONS_DIR, 'db-index.json');

type DbIndexState = {
  indexedAt: number;
  mode: 'auth' | 'noauth';
};

let inflight: Promise<void> | null = null;
let memoryIndexedMode: DbIndexState['mode'] | null = null;

async function readState(): Promise<DbIndexState | null> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw) as DbIndexState;
  } catch {
    return null;
  }
}

async function writeState(): Promise<void> {
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
  const state: DbIndexState = {
    indexedAt: Date.now(),
    mode: isAuthEnabled() ? 'auth' : 'noauth',
  };
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function hasFilesystemContent(mode: DbIndexState['mode']): Promise<{ documents: boolean; audiobooks: boolean }> {
  let documentsPresent = false;
  let audiobooksPresent = false;

  // Documents are always stored under documents_v1.
  try {
    const entries = await fs.readdir(DOCUMENTS_V1_DIR);
    documentsPresent = entries.some((name) => /^[a-f0-9]{64}__.+$/i.test(name));
  } catch {
    // ignore
  }

  // Audiobooks differ by auth-mode layout.
  const audiobookDir = mode === 'auth' ? getUnclaimedAudiobookDir() : AUDIOBOOKS_V1_DIR;
  try {
    const entries = await fs.readdir(audiobookDir, { withFileTypes: true });
    audiobooksPresent = entries.some((e) => e.isDirectory() && e.name.endsWith('-audiobook'));
  } catch {
    // ignore
  }

  return { documents: documentsPresent, audiobooks: audiobooksPresent };
}

async function isDocumentIndexed(id: string): Promise<boolean> {
  const result = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
  return result.length > 0;
}

async function isAudiobookIndexedForUser(id: string, userId: string): Promise<boolean> {
  const result = await db
    .select({ id: audiobooks.id })
    .from(audiobooks)
    .where(and(eq(audiobooks.id, id), eq(audiobooks.userId, userId)));
  return result.length > 0;
}

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

export async function getUnclaimedCounts(): Promise<{ documents: number; audiobooks: number }> {
  const [docCount] = await db.select({ count: count() }).from(documents).where(eq(documents.userId, UNCLAIMED_USER_ID));
  const [bookCount] = await db.select({ count: count() }).from(audiobooks).where(eq(audiobooks.userId, UNCLAIMED_USER_ID));

  return {
    documents: Number(docCount?.count ?? 0),
    audiobooks: Number(bookCount?.count ?? 0),
  };
}

async function scanAndPopulateDb(): Promise<{ documents: number; audiobooks: number }> {
  const authEnabled = isAuthEnabled();

  console.log('Scanning file system for un-indexed content...');

  if (authEnabled) {
    await migrateLegacyAudiobooksToUnclaimed();
  }

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

  const audiobookScanDir = authEnabled ? getUnclaimedAudiobookDir() : AUDIOBOOKS_V1_DIR;
  if (existsSync(audiobookScanDir)) {
    const entries = await fs.readdir(audiobookScanDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.endsWith('-audiobook')) continue;

      const bookId = entry.name.replace('-audiobook', '');
      if (await isAudiobookIndexedForUser(bookId, UNCLAIMED_USER_ID)) continue;

      const dirPath = path.join(audiobookScanDir, entry.name);

      let title = 'Unknown Title';
      try {
        const metaPath = path.join(dirPath, 'audiobook.meta.json');
        const metaContent = await fs.readFile(metaPath, 'utf8');
        JSON.parse(metaContent);
      } catch {
        // ignore
      }

      const chapters = await listStoredChapters(dirPath);
      const totalDuration = chapters.reduce((acc, c) => acc + (c.durationSec || 0), 0);
      if (chapters.length > 0) title = chapters[0].title || title;

      await db.insert(audiobooks).values({
        id: bookId,
        userId: UNCLAIMED_USER_ID,
        title,
        duration: totalDuration,
      });
      console.log(`Indexed audiobook: ${bookId}`);

      for (const chapter of chapters) {
        await db.insert(audiobookChapters).values({
          id: `${bookId}-${chapter.index}`,
          bookId,
          userId: UNCLAIMED_USER_ID,
          chapterIndex: chapter.index,
          title: chapter.title,
          duration: chapter.durationSec || 0,
          filePath: chapter.filePath,
          format: chapter.format,
        });
      }
    }
  }

  return getUnclaimedCounts();
}

/**
 * Ensure DB has rows for existing filesystem content (documents/audiobooks).
 *
 * This is intentionally safe to call from routes:
 * - Runs at most once per process (memoryIndexed)
 * - Uses a persisted state file under docstore/.migrations to avoid rescanning every boot
 */
export async function ensureDbIndexed(): Promise<void> {
  const mode: DbIndexState['mode'] = isAuthEnabled() ? 'auth' : 'noauth';
  if (memoryIndexedMode === mode) return;

  inflight ??= (async () => {
    const hasState = existsSync(STATE_PATH) ? await readState() : null;
    if (hasState && hasState.mode === mode) {
      // If the DB was reset but the state file survived, don't get stuck "indexed" forever.
      // Only skip if:
      // - the DB already has rows for any on-disk content (per category), OR
      // - there is no content on disk to index (per category).
      //
      // This avoids a bad state where (for example) audiobooks are indexed, but documents exist on disk
      // and aren't counted/claimable because we early-exit based on "some DB rows exist".
      const [counts, fsHas] = await Promise.all([getUnclaimedCounts(), hasFilesystemContent(mode)]);
      const docsOk = counts.documents > 0 || !fsHas.documents;
      const audiobooksOk = counts.audiobooks > 0 || !fsHas.audiobooks;

      if (docsOk && audiobooksOk) {
        memoryIndexedMode = mode;
        return;
      }
    }

    await fs.mkdir(DOCSTORE_DIR, { recursive: true });
    await scanAndPopulateDb();
    await writeState();
    memoryIndexedMode = mode;
  })().finally(() => {
    inflight = null;
  });

  await inflight;
}
