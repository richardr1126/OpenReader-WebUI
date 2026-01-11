import { useState, useEffect } from 'react';
import { Howl } from 'howler';

interface UseBackgroundStateProps {
  activeHowl: Howl | null;
  isPlaying: boolean;
  playAudio: () => void;
}

/**
 * Hook to track background state and maintain audio context
 *
 * NOTE: This hook does NOT pause audio when backgrounded.
 * Audio continues playing in background tabs and when screen is off.
 * This is enabled by the Media Session API for cross-browser support.
 */
export function useBackgroundState({ activeHowl, isPlaying, playAudio }: UseBackgroundStateProps) {
  const [isBackgrounded, setIsBackgrounded] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBackgrounded(document.hidden);

      // Do NOT pause when backgrounded - allow continuous playback
      // Media Session API handles lock screen controls and background playback
      // Howler.js will continue playing even when page is hidden
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, activeHowl, playAudio]);

  return isBackgrounded;
}