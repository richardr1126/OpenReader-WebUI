'use client';

import { useEffect, useCallback } from 'react';

export interface MediaSessionMetadata {
  title: string;
  artist?: string;
  album?: string;
  artwork?: Array<{
    src: string;
    sizes?: string;
    type?: string;
  }>;
}

export interface MediaSessionControls {
  togglePlay: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  nextChapter?: () => void;
  previousChapter?: () => void;
}

interface UseMediaSessionProps {
  metadata?: MediaSessionMetadata;
  controls: MediaSessionControls;
  enabled?: boolean;
}

/**
 * Custom hook for managing Media Session API
 * Enables background playback, lock screen controls, and system media key support
 *
 * Features:
 * - Dynamic metadata (title, artist, artwork)
 * - Lock screen media controls on mobile
 * - Background tab playback in Firefox
 * - System media key support (keyboard, headphones)
 * - Chapter navigation for audiobooks
 */
export function useMediaSession({ metadata, controls, enabled = true }: UseMediaSessionProps) {
  // Update playback state
  const setPlaybackState = useCallback((state: MediaSessionPlaybackState) => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = state;
      } catch (error) {
        console.warn('Failed to set playback state:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator)) {
      return;
    }

    // Set metadata
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata?.title || 'Text-to-Speech',
        artist: metadata?.artist || 'OpenReader WebUI',
        album: metadata?.album || 'Audiobook',
        artwork: metadata?.artwork || [
          {
            src: '/icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      });
    } catch (error) {
      console.warn('Failed to set media session metadata:', error);
    }

    // Set action handlers
    try {
      navigator.mediaSession.setActionHandler('play', controls.togglePlay);
      navigator.mediaSession.setActionHandler('pause', controls.togglePlay);
      navigator.mediaSession.setActionHandler('seekbackward', controls.skipBackward);
      navigator.mediaSession.setActionHandler('seekforward', controls.skipForward);

      // Chapter navigation (optional)
      if (controls.nextChapter) {
        navigator.mediaSession.setActionHandler('nexttrack', controls.nextChapter);
      } else {
        navigator.mediaSession.setActionHandler('nexttrack', controls.skipForward);
      }

      if (controls.previousChapter) {
        navigator.mediaSession.setActionHandler('previoustrack', controls.previousChapter);
      } else {
        navigator.mediaSession.setActionHandler('previoustrack', controls.skipBackward);
      }
    } catch (error) {
      console.warn('Failed to set media session action handlers:', error);
    }

    // Cleanup on unmount
    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('seekbackward', null);
          navigator.mediaSession.setActionHandler('seekforward', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.metadata = null;
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
  }, [metadata, controls, enabled]);

  return { setPlaybackState };
}
