import { useState, useEffect } from 'react';
import { Howl } from 'howler';

interface UseBackgroundStateProps {
  activeHowl: Howl | null;
  isPlaying: boolean;
  keepPlayingInBackground: boolean;
}

export function useBackgroundState({ activeHowl, isPlaying, keepPlayingInBackground }: UseBackgroundStateProps) {
  const [isBackgrounded, setIsBackgrounded] = useState(false);

  useEffect(() => {
    setIsBackgrounded(document.hidden);

    const handleVisibilityChange = () => {
      setIsBackgrounded(document.hidden);
      if (document.hidden && !keepPlayingInBackground) {
        // When backgrounded, pause audio but maintain isPlaying state
        if (activeHowl?.playing()) {
          activeHowl.pause();
        }
      } else if (isPlaying) {
        // When returning to foreground, resume from current position
        if (activeHowl && !activeHowl.playing()) {
          activeHowl.play();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, activeHowl, keepPlayingInBackground]);

  useEffect(() => {
    if (!document.hidden || !activeHowl || !isPlaying) return;

    if (keepPlayingInBackground) {
      if (!activeHowl.playing()) {
        activeHowl.play();
      }
      return;
    }

    if (activeHowl.playing()) {
      activeHowl.pause();
    }
  }, [activeHowl, isPlaying, keepPlayingInBackground]);

  return isBackgrounded;
}
