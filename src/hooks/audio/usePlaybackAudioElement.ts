'use client';

import { useCallback, useEffect, useRef } from 'react';

// Tiny silent WAV used to unlock HTML5 audio on iOS/Safari.
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

type UsePlaybackAudioElementInput = {
  audioContext: AudioContext | null;
  audioSpeed: number;
};

export function usePlaybackAudioElement(input: UsePlaybackAudioElementInput) {
  const { audioContext, audioSpeed } = input;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockAttemptRef = useRef(0);

  const ensureAudio = useCallback(() => {
    let audio = audioRef.current;
    if (audio) return audio;

    audio = new Audio();
    audio.preload = 'auto';
    try {
      audio.setAttribute('playsinline', 'true');
    } catch {
      // Some media shims do not implement DOM attributes.
    }
    audioRef.current = audio;
    return audio;
  }, []);

  const clearAudioSource = useCallback(() => {
    unlockAttemptRef.current += 1;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // Ignore teardown errors from partially initialized browser media.
    }
  }, []);

  const unlockAudioOnUserGesture = useCallback((preserveCurrentSource: boolean) => {
    unlockAttemptRef.current += 1;
    const attempt = unlockAttemptRef.current;

    try {
      void audioContext?.resume();
    } catch {
      // AudioContext unlocking is best-effort.
    }

    try {
      const audio = ensureAudio();
      if (preserveCurrentSource && audio.src && audio.src !== SILENT_WAV_DATA_URI) return;
      audio.src = SILENT_WAV_DATA_URI;
      audio.volume = 0;

      const playResult = audio.play();
      if (playResult && typeof playResult.then === 'function') {
        void playResult
          .then(() => {
            if (unlockAttemptRef.current !== attempt) return;
            try {
              audio.pause();
              audio.currentTime = 0;
              audio.volume = 1;
            } catch {
              // The gesture already unlocked playback; resetting is best-effort.
            }
          })
          .catch(() => undefined);
      }
    } catch {
      // Browsers that reject the silent playback attempt can retry on Play.
    }
  }, [audioContext, ensureAudio]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = audioSpeed;
  }, [audioSpeed]);

  useEffect(() => clearAudioSource, [clearAudioSource]);

  return {
    audioRef,
    clearAudioSource,
    ensureAudio,
    unlockAudioOnUserGesture,
  };
}
