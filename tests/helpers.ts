import { Page, expect } from '@playwright/test';

const DIR = './tests/files/';
// Small util to safely use filenames inside regex patterns
function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Upload a sample epub or pdf
 */
export async function uploadFile(page: Page, filePath: string) {
  await page.waitForSelector('input[type=file]', { timeout: 10000 });
  await page.setInputFiles('input[type=file]', `${DIR}${filePath}`);
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

  // Expect for buttons to be disabled
  await expect(page.locator('button[aria-label="Skip forward"][disabled]')).toBeVisible();
  await expect(page.locator('button[aria-label="Skip backward"][disabled]')).toBeVisible();

  // Wait for the TTS to stop processing
  await Promise.all([
    page.waitForSelector('button[aria-label="Skip forward"]:not([disabled])', { timeout: 45000 }),
    page.waitForSelector('button[aria-label="Skip backward"]:not([disabled])', { timeout: 45000 }),
  ]);

  await page.waitForFunction(() => {
    return navigator.mediaSession?.playbackState === 'playing';
  });
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
  // Navigate to the home page before each test
  await page.goto('/');
  //await page.waitForLoadState('networkidle');

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
  await page.getByRole('tab', { name: '📄 Documents' }).click();
}

// Delete all local documents through Settings and close dialogs
export async function deleteAllLocalDocuments(page: Page) {
  await openSettingsDocumentsTab(page);
  await page.getByRole('button', { name: 'Delete local docs' }).click();

  const heading = page.getByRole('heading', { name: 'Delete Local Documents' });
  await expect(heading).toBeVisible({ timeout: 10000 });

  const confirmBtn = heading.locator('xpath=ancestor::*[@role="dialog"][1]//button[normalize-space()="Delete"]');
  await confirmBtn.click();

  // Close any remaining modal layers
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

// Extract the current list order (by visible .document-link elements)
export async function getNamesInOrder(page: Page): Promise<string[]> {
  const texts = await page.locator('.document-link').allInnerTexts();
  return texts.map(t => t.split('\n')[0].trim());
}

// Set sort field (by listbox button) to a given field label
export async function setSortField(page: Page, fieldLabel: string) {
  // The listbox trigger shows current field (e.g. "Name"|"Size")
  await page.getByRole('button', { name: /Name|Size|Date/i }).click();
  await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(fieldLabel)}$`, 'i') }).click();
  // Verify it reflects the chosen field
  await expect(page.getByRole('button', { name: new RegExp(`^${escapeRegExp(fieldLabel)}$`, 'i') })).toBeVisible();
}

// Ensure sort direction button shows an expected label (toggle as needed)
export async function ensureSortDirection(page: Page, expectedLabel: RegExp) {
  // Direction button text is one of: A-Z, Z-A, Newest, Oldest, Smallest, Largest
  const directionButton = page.getByRole('button', { name: /A-Z|Z-A|Newest|Oldest|Smallest|Largest/ });
  const current = (await directionButton.textContent())?.trim() ?? '';
  if (!expectedLabel.test(current)) {
    await directionButton.click();
    await expect(directionButton).toHaveText(expectedLabel);
  }
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

// Open Speed popover in TTS bar
export async function openSpeedPopover(page: Page) {
  const ttsbar = page.locator('[data-app-ttsbar]');
  const buttons = ttsbar.getByRole('button');
  // Heuristic: the Speed control is the first button in the TTS bar and shows something like "1x"
  const speedBtn = buttons.first();
  await expect(speedBtn).toBeVisible({ timeout: 10000 });
  await speedBtn.click();
  // Popover panel should appear with sliders
  await page.waitForSelector('input[type="range"]', { timeout: 10000 });
}

// Change the "Native model speed" slider to a specific value and assert processing -> playing
export async function changeNativeSpeedAndAssert(page: Page, newSpeed: number) {
  await openSpeedPopover(page);
  const slider = page.locator('input[type="range"]').first();

  // Set the slider value programmatically and dispatch events to trigger handlers
  const valueStr = String(newSpeed);
  await slider.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('mouseup', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    input.dispatchEvent(new Event('touchend', { bubbles: true }));
  }, valueStr);

  await expectProcessingTransition(page);
}

// Expect navigator.mediaSession.playbackState to equal given state
export async function expectMediaState(page: Page, state: 'playing' | 'paused') {
  await page.waitForFunction((s) => navigator.mediaSession?.playbackState === s, state, { timeout: 20000 });
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