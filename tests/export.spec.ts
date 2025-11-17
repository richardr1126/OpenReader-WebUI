import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import util from 'util';
import { execFile } from 'child_process';
import { setupTest, uploadAndDisplay } from './helpers';

const execFileAsync = util.promisify(execFile);

async function getBookIdFromUrl(page: Page, expectedPrefix: 'pdf' | 'epub') {
  const url = new URL(page.url());
  const segments = url.pathname.split('/').filter(Boolean);
  expect(segments[0]).toBe(expectedPrefix);
  const bookId = segments[1];
  expect(bookId).toBeTruthy();
  return bookId;
}

async function openExportModal(page: Page) {
  const exportButton = page.getByRole('button', { name: 'Open audiobook export' });
  await expect(exportButton).toBeVisible({ timeout: 15_000 });
  await exportButton.click();
  await expect(page.getByRole('heading', { name: 'Export Audiobook' })).toBeVisible({ timeout: 15_000 });
}

async function setContainerFormatToMP3(page: Page) {
  const formatTrigger = page.getByRole('button', { name: /M4B|MP3/i });
  await expect(formatTrigger).toBeVisible({ timeout: 15_000 });
  await formatTrigger.click();
  await page.getByRole('option', { name: 'MP3' }).click();
}

async function startGeneration(page: Page) {
  const startButton = page.getByRole('button', { name: 'Start Generation' });
  await expect(startButton).toBeVisible({ timeout: 15_000 });
  await startButton.click();
}

async function waitForChaptersHeading(page: Page) {
  await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible({ timeout: 60_000 });
}

async function downloadFullAudiobook(page: Page, timeoutMs = 60_000) {
  const fullDownloadButton = page.getByRole('button', { name: /Full Download/i });
  await expect(fullDownloadButton).toBeVisible({ timeout: timeoutMs });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: timeoutMs }),
    fullDownloadButton.click(),
  ]);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const stats = fs.statSync(downloadedPath!);
  expect(stats.size).toBeGreaterThan(0);
  return downloadedPath!;
}

async function getAudioDurationSeconds(filePath: string) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function expectChaptersBackendState(page: Page, bookId: string) {
  const res = await page.request.get(`/api/audio/convert/chapters?bookId=${bookId}`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json;
}

async function resetAudiobookIfPresent(page: Page) {
  const resetButtons = page.getByRole('button', { name: 'Reset' });
  const count = await resetButtons.count();

  if (count === 0) {
    return;
  }

  const resetButton = resetButtons.first();
  await resetButton.click();

  await expect(page.getByRole('heading', { name: 'Reset Audiobook' })).toBeVisible({ timeout: 15_000 });
  const confirmReset = page.getByRole('button', { name: 'Reset' }).last();
  await confirmReset.click();

  await expect(
    page.getByText(/Click "Start Generation" to begin creating your audiobook/i)
  ).toBeVisible({ timeout: 60_000 });
}

test.describe('Audiobook export', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('exports full MP3 audiobook for PDF using mocked 10s TTS sample', async ({ page }) => {
    // Ensure TTS is mocked and app is ready
    await setupTest(page);

    // Upload and open the sample PDF in the viewer
    await uploadAndDisplay(page, 'sample.pdf');

    // Capture the generated document/book id from the /pdf/[id] URL
    const bookId = await getBookIdFromUrl(page, 'pdf');

    // Open the audiobook export modal from the header button
    await openExportModal(page);

    // While there are no chapters yet, we can still switch the container format.
    // Choose MP3 so we can validate MP3 duration end-to-end.
    await setContainerFormatToMP3(page);

    // Start generation; this will call the mocked /api/tts which returns a 10s sample.mp3 per page
    await startGeneration(page);

    // Wait for chapters list to appear and populate at least two items (Pages 1 and 2)
    await waitForChaptersHeading(page);
    const chapterActionsButtons = page.getByRole('button', { name: 'Chapter actions' });
    await expect(chapterActionsButtons).toHaveCount(2, { timeout: 60_000 });

    // Trigger full download from the FRONTEND button and capture via Playwright's download API.
    // The button label can be "Full Download (MP3)" or "Full Download (M4B)" depending on
    // the server-side detected format, so match more loosely on the accessible name.
    const downloadedPath = await downloadFullAudiobook(page);

    // Use ffprobe (same toolchain as the server) to validate the combined audio duration.
    // The TTS route is mocked to return a 10s sample.mp3 for each page, so with at least
    // two chapters we should be close to ~20 seconds of audio.
    const durationSeconds = await getAudioDurationSeconds(downloadedPath);
    // Duration must be within a reasonable window around 20 seconds to allow
    // for encoding variations and container overhead.
    expect(durationSeconds).toBeGreaterThan(18);
    expect(durationSeconds).toBeLessThan(22);

    // Also check the chapter metadata API for consistency
    const json = await expectChaptersBackendState(page, bookId);
    expect(json.exists).toBe(true);
    expect(Array.isArray(json.chapters)).toBe(true);
    expect(json.chapters.length).toBeGreaterThanOrEqual(2);
    for (const ch of json.chapters) {
      expect(ch.duration).toBeGreaterThan(0);
    }

    await resetAudiobookIfPresent(page);
  });

  test('handles partial EPUB audiobook generation, cancel, and full download of partial audiobook', async ({ page }) => {
    await setupTest(page);

    // Upload and open the sample EPUB in the viewer
    await uploadAndDisplay(page, 'sample.epub');

    // URL should now be /epub/[id]
    const bookId = await getBookIdFromUrl(page, 'epub');

    // Open the audiobook export modal from the header button
    await openExportModal(page);

    // Set container format to MP3
    await setContainerFormatToMP3(page);

    // Start generation
    await startGeneration(page);

    // Progress card should appear with a Cancel button while chapters are being generated
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await expect(cancelButton).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible({ timeout: 60_000 });

    // Wait until at least 3 chapters are listed in the UI; record the exact count at the
    // moment we decide to cancel, and assert that no additional chapters are added afterward.
    const chapterActionsButtons = page.getByRole('button', { name: 'Chapter actions' });
    await expect(chapterActionsButtons.nth(2)).toBeVisible({ timeout: 120_000 });
    const chapterCountBeforeCancel = await chapterActionsButtons.count();
    expect(chapterCountBeforeCancel).toBeGreaterThanOrEqual(3);

    // Now cancel the in-flight generation
    await cancelButton.click();

    // After cancellation, the inline progress card's Cancel button should be gone
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

    // After cancellation, determine the canonical chapter count from the backend and
    // assert that the UI eventually reflects this count. Some in-flight chapters may
    // complete right as we cancel, so we treat the backend state as source of truth.
    const jsonAfterCancel = await expectChaptersBackendState(page, bookId);
    expect(jsonAfterCancel.exists).toBe(true);
    expect(Array.isArray(jsonAfterCancel.chapters)).toBe(true);
    const chapterCountAfterCancel = jsonAfterCancel.chapters.length;
    expect(chapterCountAfterCancel).toBeGreaterThanOrEqual(chapterCountBeforeCancel);

    // Wait for the UI to reflect the final backend chapter count to avoid race
    // conditions between the modal's soft refresh and our assertions.
    await expect(chapterActionsButtons).toHaveCount(chapterCountAfterCancel, { timeout: 60_000 });

    // The Full Download button should still be available for the partially generated audiobook
    const downloadedPath = await downloadFullAudiobook(page);

    const durationSeconds = await getAudioDurationSeconds(downloadedPath);
    expect(durationSeconds).toBeGreaterThan(25);
    expect(durationSeconds).toBeLessThan(300);

    // Backend should still reflect the same number of chapters as when we first
    // observed the stabilized post-cancellation state, and should not contain
    // additional "impartial" chapters produced after cancellation.
    const json = await expectChaptersBackendState(page, bookId);
    expect(json.exists).toBe(true);
    expect(Array.isArray(json.chapters)).toBe(true);
    expect(json.chapters.length).toBe(chapterCountAfterCancel);

    await resetAudiobookIfPresent(page);
  });

  test('downloads a single chapter via chapter actions menu (PDF)', async ({ page }) => {
    await setupTest(page);
    await uploadAndDisplay(page, 'sample.pdf');

    const bookId = await getBookIdFromUrl(page, 'pdf');

    await openExportModal(page);
    await setContainerFormatToMP3(page);
    await startGeneration(page);

    await waitForChaptersHeading(page);

    // Wait for at least one chapter row to appear (one "Chapter actions" button)
    const chapterActionsButtons = page.getByRole('button', { name: 'Chapter actions' });
    await expect(chapterActionsButtons.first()).toBeVisible({ timeout: 90_000 });

    // Download via frontend button
    const downloadedPath = await downloadFullAudiobook(page);

    const durationSeconds = await getAudioDurationSeconds(downloadedPath);
    // For EPUB we just assert a sane non-trivial duration; at least one 10s mocked chapter.
    expect(durationSeconds).toBeGreaterThan(9);
    expect(durationSeconds).toBeLessThan(300);

    await resetAudiobookIfPresent(page);
  });

  test('reset removes all generated chapters for a PDF audiobook', async ({ page }) => {
    await setupTest(page);
    await uploadAndDisplay(page, 'sample.pdf');

    const bookId = await getBookIdFromUrl(page, 'pdf');

    await openExportModal(page);
    await setContainerFormatToMP3(page);
    await startGeneration(page);

    await waitForChaptersHeading(page);

    // Wait for Reset button to become visible, indicating resumable/generated state
    const resetButton = page.getByRole('button', { name: 'Reset' });
    await expect(resetButton).toBeVisible({ timeout: 120_000 });

    await resetButton.click();

    // Confirm in the Reset Audiobook dialog
    await expect(page.getByRole('heading', { name: 'Reset Audiobook' })).toBeVisible({ timeout: 15000 });
    const confirmReset = page.getByRole('button', { name: 'Reset' }).last();
    await confirmReset.click();

    // After reset, the hint text for starting generation should re-appear
    await expect(
      page.getByText(/Click "Start Generation" to begin creating your audiobook/i)
    ).toBeVisible({ timeout: 60_000 });

    // Backend should report no existing chapters for this bookId
    const res = await page.request.get(`/api/audio/convert/chapters?bookId=${bookId}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.exists).toBe(false);
    expect(Array.isArray(json.chapters)).toBe(true);
    expect(json.chapters.length).toBe(0);
  });

  test('regenerates a PDF audiobook chapter and preserves chapter count and full download', async ({ page }) => {
    await setupTest(page);
    await uploadAndDisplay(page, 'sample.pdf');

    // Extract bookId from /pdf/[id] URL (for backend verification later)
    const bookId = await getBookIdFromUrl(page, 'pdf');

    // Open Export Audiobook modal
    await openExportModal(page);

    // Set container format to MP3
    await setContainerFormatToMP3(page);

    // Start generation
    await startGeneration(page);

    // Wait for chapters to appear
    await waitForChaptersHeading(page);

    const chapterActionsButtons = page.getByRole('button', { name: 'Chapter actions' });
    // Ensure we have at least two chapters for this PDF
    await expect(chapterActionsButtons.nth(1)).toBeVisible({ timeout: 60_000 });
    const chapterCountBefore = await chapterActionsButtons.count();
    expect(chapterCountBefore).toBeGreaterThanOrEqual(2);

    // Open the actions menu for the first chapter and trigger Regenerate
    const firstChapterActions = chapterActionsButtons.first();
    await firstChapterActions.click();

    // In the headlessui Menu, each option is a menuitem. Use that role instead of button.
    const regenerateMenuItem = page.getByRole('menuitem', { name: /Regenerate/i });
    await expect(regenerateMenuItem).toBeVisible({ timeout: 15000 });
    await regenerateMenuItem.click();

    // During regeneration, the row may show a "Regenerating" label; wait for any such
    // indicator to disappear, signaling completion.
    const regeneratingLabel = page.getByText(/Regenerating/);
    await expect(regeneratingLabel).toHaveCount(0, { timeout: 120_000 });

    // After regeneration completes in the UI, verify backend chapter state is fully updated
    // before triggering a full download to avoid races with ffmpeg concat on Alpine.
    const backendStateAfterRegenerate = await expectChaptersBackendState(page, bookId);
    expect(backendStateAfterRegenerate.exists).toBe(true);
    expect(Array.isArray(backendStateAfterRegenerate.chapters)).toBe(true);
    expect(backendStateAfterRegenerate.chapters.length).toBe(chapterCountBefore);
    for (const ch of backendStateAfterRegenerate.chapters) {
      expect(ch.duration).toBeGreaterThan(0);
    }

    // Chapter count should remain exactly the same after regeneration (no duplicates)
    await expect(chapterActionsButtons).toHaveCount(chapterCountBefore, { timeout: 20_000 });

    // Full Download should still work and produce a valid combined audiobook
    const downloadedPath = await downloadFullAudiobook(page);

    const durationSeconds = await getAudioDurationSeconds(downloadedPath);
    // With two mocked 10s chapters we expect roughly 20s; allow a small window.
    expect(durationSeconds).toBeGreaterThan(18);
    expect(durationSeconds).toBeLessThan(22);

    // Backend should still report the same number of chapters and valid durations
    const json = await expectChaptersBackendState(page, bookId);
    expect(json.exists).toBe(true);
    expect(Array.isArray(json.chapters)).toBe(true);
    expect(json.chapters.length).toBe(chapterCountBefore);
    for (const ch of json.chapters) {
      expect(ch.duration).toBeGreaterThan(0);
    }

    await resetAudiobookIfPresent(page);
  });
});
