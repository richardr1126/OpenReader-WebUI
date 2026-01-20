import { test, expect } from '@playwright/test';

test.describe('API health checks', () => {
  test('GET /api/tts/voices returns 200 and a non-empty voices array', async ({ request }) => {
    const res = await request.get('/api/tts/voices');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.voices)).toBeTruthy();
    expect(json.voices.length).toBeGreaterThan(0);
  });
});