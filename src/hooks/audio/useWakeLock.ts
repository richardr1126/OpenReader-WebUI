import { useEffect, useRef, useCallback } from 'react';

/**
 * Requests a screen wake lock to prevent the display from sleeping
 * during audio playback. Automatically re-acquires the lock when the
 * page regains visibility (Safari releases it on visibility change).
 */
export function useWakeLock(isPlaying: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch (err) {
      // Wake lock request can fail (e.g. low battery mode)
      console.warn('Wake lock request failed:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore release errors
      }
      wakeLockRef.current = null;
    }
  }, []);

  // Acquire/release based on playback state
  useEffect(() => {
    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [isPlaying, requestWakeLock, releaseWakeLock]);

  // Re-acquire wake lock when page becomes visible again
  // (Safari releases wake locks when the page is hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, requestWakeLock]);
}
