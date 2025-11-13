import { test, expect } from '@playwright/test';
import {
  setupTest,
  playTTSAndWaitForASecond,
  pauseTTSAndVerify,
  openVoicesMenu,
  selectVoiceAndAssertPlayback,
  changeNativeSpeedAndAssert,
  expectMediaState,
  expectProcessingTransition,
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

  test('switches to a single voice and resumes playing', async ({ page }) => {
    // Start playback
    await playTTSAndWaitForASecond(page, 'sample.pdf');

    // Ensure basic TTS controls are present
    await expect(page.getByRole('button', { name: 'Skip backward' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip forward' })).toBeVisible();

    // Open voices list and assert options render
    await openVoicesMenu(page);
    const options = page.getByRole('option');
    expect(await options.count()).toBeGreaterThan(0);

    // Step 1: Select af_bella (adds it to the multi-select list)
    await selectVoiceAndAssertPlayback(page, 'af_bella');

    // Step 2: Deselect the first (initially selected) voice so that only af_bella remains
    await openVoicesMenu(page);
    const selected = page.locator('[role="option"][aria-selected="true"]');
    const count = await selected.count();
    for (let i = 0; i < count; i++) {
      const opt = selected.nth(i);
      const name = (await opt.textContent())?.trim() ?? '';
      // Deselect the first selected option that is not af_bella
      if (!/af_bella/i.test(name)) {
        await opt.click();
        break;
      }
    }
    await expectProcessingTransition(page);

    // Final state should be playing
    await expectMediaState(page, 'playing');
  });

  test('selects multiple Kokoro voices and resumes playing', async ({ page }) => {
    // Start playback
    await playTTSAndWaitForASecond(page, 'sample.pdf');

    // Ensure TTS controls are present
    await expect(page.getByRole('button', { name: 'Skip backward' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip forward' })).toBeVisible();

    // Select first voice (e.g., bf_emma) and assert processing -> playing
    await openVoicesMenu(page);
    await selectVoiceAndAssertPlayback(page, 'bf_emma');

    // Select second voice (e.g., af_heart) to create a multi-voice mix and assert again
    await openVoicesMenu(page);
    await selectVoiceAndAssertPlayback(page, 'af_heart');

    // Final state should be playing
    await expectMediaState(page, 'playing');
  });

  test('changing TTS native speed toggles processing and returns to playing', async ({ page }) => {
    await playTTSAndWaitForASecond(page, 'sample.pdf');
    await changeNativeSpeedAndAssert(page, 1.5);
    await expectMediaState(page, 'playing');
  });
});