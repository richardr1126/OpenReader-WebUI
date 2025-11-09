import { Page, expect } from '@playwright/test';

const DIR = './tests/files/';

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
  // Upload the file
  await uploadFile(page, fileName);
  
  // Wait for link with document-link class
  const size = fileName.endsWith('.pdf') ? '0.02 MB' : '0.33 MB';
  await page.getByRole('link', { name: `${fileName} ${size}` }).click();

  // Wait for the document to load
  if (fileName.endsWith('.pdf')) {
    await page.waitForSelector('.react-pdf__Document', { timeout: 10000 });
  }
  else if (fileName.endsWith('.epub')) {
    await page.waitForSelector('.epub-container', { timeout: 10000 });
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
 * Common test setup function
 */
export async function setupTest(page: Page) {
  // Navigate to the home page before each test
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Custom OpenAI-Like' }).click();
  await page.getByText('Deepinfra').click();

  // Click the "done" button to dismiss the welcome message
  await page.getByRole('tab', { name: '🔑 API' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
}