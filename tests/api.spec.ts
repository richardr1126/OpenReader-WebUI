import { test, expect } from '@playwright/test';

test.describe('API health checks', () => {
  test('GET /api/tts/voices returns 200 and a non-empty voices array', async ({ request }) => {
    const res = await request.get('/api/tts/voices');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.voices)).toBeTruthy();
    expect(json.voices.length).toBeGreaterThan(0);
  });

  test('GET /api/audiobook/status returns 200 with exists flag and chapters array', async ({ request }) => {
    const bookId = `healthcheck-${Date.now()}`;
    const res = await request.get(`/api/audiobook/status?bookId=${bookId}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toHaveProperty('exists');
    expect(Array.isArray(json.chapters)).toBeTruthy();
  });
});