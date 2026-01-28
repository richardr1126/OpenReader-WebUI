import { Page, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const DIR = './tests/files/';
const TTS_MOCK_PATH = path.join(__dirname, 'files', 'sample.mp3');
let ttsMockBuffer: Buffer | null = null;

type RateLimitStatusResponse = {
  authEnabled: boolean;
  userType?: 'anonymous' | 'authenticated' | 'unauthenticated';
};

async function getRateLimitStatus(page: Page): Promise<RateLimitStatusResponse | null> {
  try {
    const res = await page.request.get('/api/rate-limit/status');
    if (!res.ok()) return null;
    return (await res.json()) as RateLimitStatusResponse;
  } catch {
    return null;
  }
}

async function ensureAnonymousSession(page: Page): Promise<void> {
  const initial = await getRateLimitStatus(page);
  if (!initial) return;
  if (!initial.authEnabled) return;
  if (initial.userType && initial.userType !== 'unauthenticated') return;

  // Create a session cookie for this test context.
  // This avoids races where the app makes authenticated API calls before AuthLoader finishes.
  try {
    await page.request.post('/api/auth/sign-in/anonymous', { data: {} });
  } catch {
    // ignore
  }

  // Wait until the server sees us as anonymous/authenticated (i.e. cookie persisted).
  const deadline = Date.now() + 15_000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = await getRateLimitStatus(page);
    if (next && (!next.authEnabled || (next.userType && next.userType !== 'unauthenticated'))) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for anonymous auth session in tests');
    }
    await page.waitForTimeout(200);
  }
}

async function ensureTtsRouteMock(page: Page) {
  if (!ttsMockBuffer) {
    ttsMockBuffer = fs.readFileSync(TTS_MOCK_PATH);
  }

  await page.route('**/api/tts', async (route) => {
    // Only mock the POST TTS generation calls; let anything else pass through.
    if (route.request().method().toUpperCase() !== 'POST') {
      return route.continue();
    }

    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: ttsMockBuffer as Buffer,
    });
  });
}

// Small util to safely use filenames inside regex patterns
function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Upload a sample epub or pdf
 */
export async function uploadFile(page: Page, filePath: string) {
  const input = page.locator('input[type=file]').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  await expect(input).toBeEnabled({ timeout: 10000 });

  await input.setInputFiles(`${DIR}${filePath}`);

  // Wait for the uploader to finish processing. The input is disabled while
  // uploading/converting via react-dropzone's `disabled` prop.
  // Tolerate extremely fast operations where the disabled state may be missed.
  try {
    await expect(input).toBeDisabled({ timeout: 2000 });
  } catch {
    // ignore
  }
  await expect(input).toBeEnabled({ timeout: 15000 });
}

/**
 * Upload and display a document
 */
export async function uploadAndDisplay(page: Page, fileName: string) {
  await uploadFile(page, fileName);

  const lower = fileName.toLowerCase();

  if (lower.endsWith('.docx')) {
    await expect(page.getByText('Converting DOCX to PDF...')).toBeVisible();
    const pdfName = fileName.replace(/\.docx$/i, '.pdf');
    await page.getByRole('link', { name: new RegExp(escapeRegExp(pdfName), 'i') }).click();
    await page.waitForSelector('.react-pdf__Document', { timeout: 15000 });
    return;
  }

  await page.getByRole('link', { name: new RegExp(escapeRegExp(fileName), 'i') }).click();

  if (lower.endsWith('.pdf')) {
    await page.waitForSelector('.react-pdf__Document', { timeout: 10000 });
  } else if (lower.endsWith('.epub')) {
    await page.waitForSelector('.epub-container', { timeout: 10000 });
  } else if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    await page.waitForSelector('.html-container', { timeout: 10000 });
  }
}

/**
 * Wait for the play button to be clickable and click it
 */
export async function waitAndClickPlay(page: Page) {
  // Wait for play button selector without disabled attribute
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  // Play the TTS by clicking the button
  await page.getByRole('button', { name: 'Play' }).click();
  // Use resilient processing transition helper (tolerates fast completion)
  await expectProcessingTransition(page);
}

/**
 * Setup function for TTS playback tests
 */
export async function playTTSAndWaitForASecond(page: Page, fileName: string) {
  // Upload and display the document
  await uploadAndDisplay(page, fileName);
  // Wait for play button selector without disabled attribute
  await waitAndClickPlay(page);
  // play for 1s
  await page.waitForTimeout(1000);
}
/**
 * Pause TTS playback and verify paused state
 */
export async function pauseTTSAndVerify(page: Page) {
  // Click pause to stop playback
  await page.getByRole('button', { name: 'Pause' }).click();

  // Check for play button to be visible
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 10000 });
}

/**
 * Common test setup function
 */
export async function setupTest(page: Page) {
  // Mock the TTS API so tests don't hit the real TTS service.
  await ensureTtsRouteMock(page);

  // If auth is enabled, establish an anonymous session BEFORE navigation.
  // This keeps each test self-contained (no shared storageState) while ensuring
  // server routes that require auth don't intermittently 401 during app startup.
  // await ensureAnonymousSession(page);

  // Navigate to the home page before each test
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // AuthLoader may show a full-screen overlay while session is loading.
  // Wait for it to be gone before interacting with underlying UI.
  await page
    .waitForSelector('.fixed.inset-0.bg-base.z-50', { state: 'detached', timeout: 15_000 })
    .catch(() => { });

  // Privacy modal should come first in onboarding.
  // Be tolerant if it's already accepted (e.g., reused context).
  const privacyBtn = page.getByRole('button', { name: 'I Understand' });
  try {
    await expect(privacyBtn).toBeVisible({ timeout: 5000 });
    await privacyBtn.click();
  } catch {
    // ignore
  }

  // Settings modal should appear after privacy acceptance on first visit.
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 10000 });

  // If running in CI, select the "Custom OpenAI-Like" model and "Deepinfra" provider
  if (process.env.CI) {
    await page.getByRole('button', { name: 'Custom OpenAI-Like' }).click();
    await page.getByText('Deepinfra').click();
  }

  // Click the "done" button to dismiss the welcome message
  await page.getByRole('button', { name: 'Save' }).click();
}


// Assert a document link containing the given filename appears in the list
export async function expectDocumentListed(page: Page, fileName: string) {
  await expect(
    page.getByRole('link', { name: new RegExp(escapeRegExp(fileName), 'i') })
  ).toBeVisible({ timeout: 10000 });
}

// Assert a document link containing the given filename does NOT exist
export async function expectNoDocumentLink(page: Page, fileName: string) {
  await expect(
    page.getByRole('link', { name: new RegExp(escapeRegExp(fileName), 'i') })
  ).toHaveCount(0);
}

// Upload multiple files in sequence
export async function uploadFiles(page: Page, ...fileNames: string[]) {
  for (const name of fileNames) {
    await uploadFile(page, name);
  }
}

// Ensure a set of documents are visible in the list
export async function ensureDocumentsListed(page: Page, fileNames: string[]) {
  for (const name of fileNames) {
    await expectDocumentListed(page, name);
  }
}

// Click the document link row by filename
export async function clickDocumentLink(page: Page, fileName: string) {
  await page
    .getByRole('link', { name: new RegExp(escapeRegExp(fileName), 'i') })
    .first()
    .click();
}

// Expect correct URL and viewer to be visible for a given file by extension
export async function expectViewerForFile(page: Page, fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf') || lower.endsWith('.docx')) {
    // DOCX converts to PDF, so viewer expectations are PDF
    await expect(page).toHaveURL(/\/pdf\/[A-Za-z0-9._%-]+$/);
    await expect(page.locator('.react-pdf__Document')).toBeVisible({ timeout: 15000 });
    return;
  }
  if (lower.endsWith('.epub')) {
    await expect(page).toHaveURL(/\/epub\/[A-Za-z0-9._%-]+$/);
    await expect(page.locator('.epub-container')).toBeVisible({ timeout: 15000 });
    return;
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    await expect(page).toHaveURL(/\/html\/[A-Za-z0-9._%-]+$/);
    await expect(page.locator('.html-container')).toBeVisible({ timeout: 15000 });
    return;
  }
}

// Delete a single document by filename via row action and confirm dialog
export async function deleteDocumentByName(page: Page, fileName: string) {
  const link = page.getByRole('link', { name: new RegExp(escapeRegExp(fileName), 'i') }).first();
  await link.locator('xpath=..').getByRole('button', { name: 'Delete document' }).click();

  const heading = page.getByRole('heading', { name: 'Delete Document' });
  await expect(heading).toBeVisible({ timeout: 10000 });

  const confirmBtn = heading.locator('xpath=ancestor::*[@role="dialog"][1]//button[normalize-space()="Delete"]');
  await confirmBtn.click();
}

// Open Settings modal and navigate to Documents tab
export async function openSettingsDocumentsTab(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: '📄 Docs' }).click();
}

// Delete all local documents through Settings and close dialogs
export async function deleteAllLocalDocuments(page: Page) {
  await openSettingsDocumentsTab(page);
  await page.getByRole('button', { name: 'Delete local' }).click();

  const heading = page.getByRole('heading', { name: 'Delete Local Documents' });
  await expect(heading).toBeVisible({ timeout: 10000 });

  const confirmBtn = heading.locator('xpath=ancestor::*[@role="dialog"][1]//button[normalize-space()="Delete"]');
  await confirmBtn.click();

  // Close any remaining modal layers
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// Open the Voices dropdown from the TTS bar and return the button locator
export async function openVoicesMenu(page: Page) {
  const ttsbar = page.locator('[data-app-ttsbar]');
  await expect(ttsbar).toBeVisible({ timeout: 10000 });

  // If the listbox/options already exist, assume it's open and return (idempotent)
  const alreadyOpen = await page.locator('[role="listbox"], [role="option"]').count();
  if (alreadyOpen > 0) {
    return;
  }

  // Prefer a stable selector using accessible name if present, otherwise fall back to a
  // button whose label matches any known default voice (including "af_" prefixed ones),
  // and finally the last button heuristic.
  const candidateByName = ttsbar.getByRole('button', { name: /Voices|(af_)?(alloy|ash|coral|echo|fable|onyx|nova|sage|shimmer)/i });

  const hasNamed = await candidateByName.count();
  const voicesButton = hasNamed > 0 ? candidateByName.first() : ttsbar.getByRole('button').last();

  await expect(voicesButton).toBeVisible();
  await voicesButton.click();

  // Wait for the options panel to appear; tolerate different render strategies by
  // waiting for either the listbox container or at least one option.
  await Promise.race([
    page.waitForSelector('[role="listbox"]', { timeout: 10000 }),
    page.waitForSelector('[role="option"]', { timeout: 10000 }),
  ]);
}

// Select a voice from the Voices dropdown and assert processing -> playing
export async function selectVoiceAndAssertPlayback(page: Page, voiceName: string | RegExp) {
  // Ensure the menu is open without toggling it closed if already open
  const optionCount = await page.locator('[role="option"]').count();
  if (optionCount === 0) {
    await openVoicesMenu(page);
  }

  await page.getByRole('option', { name: voiceName }).first().click();
  await expectProcessingTransition(page);
}

// Assert skip buttons disabled during processing, then enabled, and playbackState=playing
export async function expectProcessingTransition(page: Page) {
  // Try to detect a brief processing phase where skip buttons are disabled,
  // but tolerate cases where processing completes too quickly to observe.
  const disabledForward = page.locator('button[aria-label="Skip forward"][disabled]');
  const disabledBackward = page.locator('button[aria-label="Skip backward"][disabled]');
  try {
    await Promise.all([
      expect(disabledForward).toBeVisible({ timeout: 3000 }),
      expect(disabledBackward).toBeVisible({ timeout: 3000 }),
    ]);
  } catch {
    // Processing may have completed before we observed disabled state; cause warning but continue
  }

  // Wait for the TTS to stop processing and buttons to be enabled
  await Promise.all([
    page.waitForSelector('button[aria-label="Skip forward"]:not([disabled])', { timeout: 45000 }),
    page.waitForSelector('button[aria-label="Skip backward"]:not([disabled])', { timeout: 45000 }),
  ]);

  // Ensure media session is playing
  await expectMediaState(page, 'playing');
}

// Expect navigator.mediaSession.playbackState to equal given state
export async function expectMediaState(page: Page, state: 'playing' | 'paused') {
  // WebKit (and sometimes other engines) may not reliably update navigator.mediaSession.playbackState.
  // Fallback heuristics:
  // 1. Prefer mediaSession if it matches desired state.
  // 2. Otherwise inspect any <audio> element: use paused flag and currentTime progression.
  // 3. Allow short grace period for first frame to advance.
  // 4. If neither detectable, keep polling until timeout.
  await page.waitForFunction((desired) => {
    try {
      const msState = (navigator.mediaSession && navigator.mediaSession.playbackState) || '';
      if (msState === desired) return true;

      const audio: HTMLAudioElement | null = document.querySelector('audio');
      if (audio) {
        // Track advancement by storing last time on the element dataset
        const last = parseFloat(audio.dataset.lastTime || '0');
        const curr = audio.currentTime;
        audio.dataset.lastTime = String(curr);

        if (desired === 'playing') {
          // Consider playing if not paused AND time has advanced at least a tiny amount
          if (!audio.paused && curr > 0 && curr > last) return true;
        } else {
          // paused target
          if (audio.paused) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, state);
}

// Use Navigator to go to a specific page number (PDF)
export async function navigateToPdfPageViaNavigator(page: Page, targetPage: number) {
  // Navigator popover shows "X / Y"
  const navTrigger = page.getByRole('button', { name: /\d+\s*\/\s*\d+/ });
  await expect(navTrigger).toBeVisible({ timeout: 10000 });
  await navTrigger.click();

  const input = page.getByLabel('Page number');
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(String(targetPage));
  await input.press('Enter');
}

// Count currently rendered react-pdf Page components
export async function countRenderedPdfPages(page: Page): Promise<number> {
  return await page.locator('.react-pdf__Page').count();
}

// Count currently rendered text layers (active page(s))
export async function countRenderedTextLayers(page: Page): Promise<number> {
  return await page.locator('.react-pdf__Page__textContent').count();
}

// Force viewport resize to trigger resize hooks (e.g., EPUB)
export async function triggerViewportResize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
}

// Wait for DocumentListState.showHint to persist in IndexedDB 'app-config' store
export async function waitForDocumentListHintPersist(page: Page, expected: boolean) {
  await page.waitForFunction(async (exp) => {
    try {
      const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('openreader-db');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const db = await openDb();
      const readConfig = () => new Promise<any>((resolve, reject) => {
        const tx = db.transaction(['app-config'], 'readonly');
        const store = tx.objectStore('app-config');
        const getReq = store.get('singleton');
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => reject(getReq.error);
      });
      const item = await readConfig();
      db.close();
      if (!item || typeof item.documentListState !== 'object') return false;
      const state = item.documentListState;
      if (!state || typeof state.showHint !== 'boolean') return false;
      return state.showHint === exp;
    } catch {
      return false;
    }
  }, expected, { timeout: 5000 });
}
