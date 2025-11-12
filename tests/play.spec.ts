import { test, expect } from '@playwright/test';
import {
  setupTest,
  playTTSAndWaitForASecond,
  pauseTTSAndVerify,
  openVoicesMenu,
  selectVoiceAndAssertPlayback,
  changeNativeSpeedAndAssert,
  expectMediaState,
} from './helpers';

test.describe('Play/Pause Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupTest(page);
  });

  test.describe.configure({ mode: 'serial' });

  test('plays and pauses TTS for a PDF document', async ({ page }) => {
    // Play TTS for the PDF document
    await playTTSAndWaitForASecond(page, 'sample.pdf');
    
    // Pause TTS and verify paused state
    await pauseTTSAndVerify(page);
  });

  test('plays and pauses TTS for an EPUB document', async ({ page }) => {
    // Play TTS for the EPUB document
    await playTTSAndWaitForASecond(page, 'sample.epub');
    
    // Pause TTS and verify paused state
    await pauseTTSAndVerify(page);
  });

  test('plays and pauses TTS for an DOCX document', async ({ page }) => {
    // Play TTS for the DOCX document
    await playTTSAndWaitForASecond(page, 'sample.docx');
    
    // Pause TTS and verify paused state
    await pauseTTSAndVerify(page);
  });

  test('plays and pauses TTS for a TXT document', async ({ page }) => {
    // Play TTS for the TXT document
    await playTTSAndWaitForASecond(page, 'sample.txt');
    
    // Pause TTS and verify paused state
    await pauseTTSAndVerify(page);
  });

  test('loads voices and switches voice with processing state then resumes play', async ({ page }) => {
    // Start playback
    await playTTSAndWaitForASecond(page, 'sample.pdf');

    // Ensure basic TTS controls are present
    await expect(page.getByRole('button', { name: 'Skip backward' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip forward' })).toBeVisible();

    // Open voices list and assert options render
    await openVoicesMenu(page);
    const options = page.getByRole('option');
    expect(await options.count()).toBeGreaterThan(0);

    // Switch to the first available voice and assert processing -> playing
    await selectVoiceAndAssertPlayback(page, /.*/);
  });

  test('changing TTS native speed toggles processing and returns to playing', async ({ page }) => {
    await playTTSAndWaitForASecond(page, 'sample.pdf');
    await changeNativeSpeedAndAssert(page, 1.5);
    await expectMediaState(page, 'playing');
  });
});