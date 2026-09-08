import Fastify from 'fastify';
import { expect, test, vi } from 'vitest';
import { createTtsPlaybackToken } from '@openreader/tts/playback-token';
import { registerPlaybackAudioRoutes } from '../../src/api/routes/playback/audio';
import type { ComputeWorkerRouteContext } from '../../src/api/route-context';
import type { PlaybackSessionReadModel } from '../../src/api/playback/session-read-model';
import type { PlaybackSessionController } from '../../src/api/playback/session-controller';

vi.mock('@openreader/tts/audio-format', async (importOriginal) => ({
  ...await importOriginal<typeof import('@openreader/tts/audio-format')>(),
  getCbrSilenceFrameLengths: async () => [417, 418],
}));

test('answers the WebKit two-byte media probe with a bounded partial response', async () => {
  const app = Fastify();
  const session = {
    sessionId: 'range-session', userId: 'user', storageUserId: 'user', documentId: 'doc',
    status: 'running', expiresAt: Date.now() + 60_000, generationStartOrdinal: 0,
    cursorOrdinal: 0, planObjectKey: 'plan.json', settingsJson: {},
  };
  const readObject = vi.fn(async () => Uint8Array.from([0xff, 0xfb, 0x90, 0x00]).buffer);
  registerPlaybackAudioRoutes({
    app, storage: { readObject }, markActivity: vi.fn(),
  } as unknown as ComputeWorkerRouteContext, {
    readSession: async () => session,
    readPlanSegments: async () => [{ ordinal: 0, text: 'Ready audio.' }],
    listCompletedDurations: async () => new Map([[0, 1000]]),
    readSegmentState: async () => ({ status: 'completed', audioKey: 'audio.mp3' }),
  } as unknown as PlaybackSessionReadModel, {} as PlaybackSessionController);
  try {
    const token = createTtsPlaybackToken({ ...session, exp: session.expiresAt }, process.env.TTS_PLAYBACK_TOKEN_SECRET!);
    const response = await app.inject({
      method: 'GET', url: `/v1/tts-playback/sessions/${session.sessionId}/audio?token=${token}`,
      headers: { range: 'bytes=0-1' },
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-range']).toMatch(/^bytes 0-1\/\d+$/);
    expect(response.headers['content-length']).toBe('2');
    expect(response.rawPayload).toEqual(Buffer.from([0xff, 0xfb]));
    expect(readObject).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
