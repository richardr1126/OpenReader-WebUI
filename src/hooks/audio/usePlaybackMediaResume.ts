'use client';

import { useCallback, type MutableRefObject } from 'react';
import { resumePlaybackMedia } from '@/lib/client/tts/playback-control';
import type { TtsPlaybackPhase } from '@/types/tts';

export function usePlaybackMediaResume(input: {
  audioSpeed: number;
  isPlayingRef: MutableRefObject<boolean>;
  playbackInFlightRef: MutableRefObject<boolean>;
  playbackRunIdRef: MutableRefObject<number>;
  setIsPlaying: (value: boolean) => void;
  setPlaybackPhase: (phase: TtsPlaybackPhase) => void;
  setWorkerPlaybackActive: (active: boolean) => void;
  startPlaybackForegroundSync: (runId: number) => void;
  checkRecovery: () => void;
}) {
  const {
    audioSpeed, isPlayingRef, playbackInFlightRef,
    playbackRunIdRef, setIsPlaying, setPlaybackPhase,
    setWorkerPlaybackActive, startPlaybackForegroundSync, checkRecovery,
  } = input;
  return useCallback((audio: HTMLAudioElement) => {
    const runId = playbackRunIdRef.current;
    setWorkerPlaybackActive(true);
    startPlaybackForegroundSync(runId);
    audio.playbackRate = audioSpeed;
    playbackInFlightRef.current = true;
    setPlaybackPhase('buffering');
    isPlayingRef.current = true;
    setIsPlaying(true);
    // Recovery also watches play() promises that never settle. Neither path
    // replaces the playback session or discards the generated-cache timeline.
    void resumePlaybackMedia(() => audio.play(), () => (
      runId === playbackRunIdRef.current && isPlayingRef.current
    )).then((result) => { if (result.status === 'stale') checkRecovery(); });
  }, [
    audioSpeed, isPlayingRef, playbackInFlightRef,
    playbackRunIdRef, setIsPlaying, setPlaybackPhase,
    setWorkerPlaybackActive, startPlaybackForegroundSync, checkRecovery,
  ]);
}
