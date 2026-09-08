import type { TtsPlaybackPhase } from '@/types/tts';
import {
  isPlaybackBufferReady,
  measurePlaybackBuffer,
  PLAYBACK_START_BUFFER_WALL_MS,
} from '@openreader/tts/playback-buffer';

export { PLAYBACK_START_BUFFER_WALL_MS } from '@openreader/tts/playback-buffer';

type PlaybackBufferSegment = {
  ordinal: number;
  durationMs: number;
  generated: boolean;
};

type PlaybackStartLayout = {
  status: string | null;
  generationStartOrdinal: number;
  segments: PlaybackBufferSegment[];
};

export function isPlaybackAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || /abort|cancel/i.test(error.message || '');
  }
  if (typeof error === 'string') return /abort|cancel/i.test(error);
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && /abort|cancel/i.test(message);
  }
  return false;
}

export type PlaybackMediaResumeResult =
  | { status: 'resumed' }
  | { status: 'cancelled' }
  | { status: 'stale'; error: unknown };

/**
 * A failed media resume may reconnect only while it still owns playback
 * intent. A pause or replacement run that wins meanwhile cancels recovery.
 */
export async function resumePlaybackMedia(
  play: () => Promise<void> | void,
  isCurrent: () => boolean,
): Promise<PlaybackMediaResumeResult> {
  try {
    await play();
    return isCurrent() ? { status: 'resumed' } : { status: 'cancelled' };
  } catch (error) {
    return isCurrent() ? { status: 'stale', error } : { status: 'cancelled' };
  }
}

export type PlaybackStartBuffer = {
  durationMs: number;
  segmentCount: number;
  reachedDocumentEnd: boolean;
};

export function measurePlaybackStartBuffer(
  segments: PlaybackBufferSegment[],
  startOrdinal: number,
): PlaybackStartBuffer {
  const result = measurePlaybackBuffer({
    segments: [...segments].sort((a, b) => a.ordinal - b.ordinal),
    startOrdinal,
  });
  return {
    durationMs: result.durationMs,
    segmentCount: result.segmentCount,
    reachedDocumentEnd: result.reachedDocumentEnd,
  };
}

export function isPlaybackStartBufferReady(input: {
  segments: PlaybackBufferSegment[];
  startOrdinal: number;
  playbackRate: number;
  minimumWallMs?: number;
  offsetWithinStartSegmentMs?: number;
}): boolean {
  return isPlaybackBufferReady({
    segments: input.segments,
    startOrdinal: input.startOrdinal,
    playbackRate: input.playbackRate,
    minimumWallMs: input.minimumWallMs ?? PLAYBACK_START_BUFFER_WALL_MS,
    offsetWithinStartSegmentMs: input.offsetWithinStartSegmentMs,
  });
}

export async function waitForPlaybackStartBuffer<T extends PlaybackStartLayout>(input: {
  loadLayout: () => Promise<T | null>;
  isCurrent: () => boolean;
  playbackRate: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<T | null> {
  const deadline = Date.now() + Math.max(1, input.timeoutMs ?? 60_000);
  for (;;) {
    if (!input.isCurrent()) return null;
    const layout = await input.loadLayout();
    if (layout?.status === 'failed') {
      throw new Error('TTS playback generation failed before audio became ready');
    }
    if (
      layout
      && (layout.status === 'running' || layout.status === 'succeeded')
      && isPlaybackStartBufferReady({
        segments: layout.segments,
        startOrdinal: layout.generationStartOrdinal,
        playbackRate: input.playbackRate,
      })
    ) {
      return layout;
    }
    if (Date.now() > deadline) {
      throw new Error('TTS playback session did not buffer enough contiguous audio in time');
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, input.pollMs ?? 250)));
  }
}

export type PlaybackControlPresentation = {
  isPending: boolean;
  ariaLabel: 'Play' | 'Pause' | 'Cancel playback loading';
  statusText: 'Preparing audio…' | 'Loading audio…' | null;
};

export function isPlaybackPhaseProcessing(
  isPlaying: boolean,
  phase: TtsPlaybackPhase,
): boolean {
  return isPlaying && (
    phase === 'planning'
    || phase === 'ready'
    || phase === 'seeking'
    || phase === 'buffering'
  );
}

export function resolvePlaybackControlPresentation(
  isPlaying: boolean,
  phase: TtsPlaybackPhase,
): PlaybackControlPresentation {
  if (!isPlaying) {
    return { isPending: false, ariaLabel: 'Play', statusText: null };
  }
  if (phase === 'playing') {
    return { isPending: false, ariaLabel: 'Pause', statusText: null };
  }
  return {
    isPending: true,
    ariaLabel: 'Cancel playback loading',
    statusText: phase === 'planning' || phase === 'ready'
      ? 'Preparing audio…'
      : 'Loading audio…',
  };
}
