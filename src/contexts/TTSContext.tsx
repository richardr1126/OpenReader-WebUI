'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache'; // Import LRUCache directly
import { Howl } from 'howler';

import { useConfig } from '@/contexts/ConfigContext';
import { splitIntoSentences, preprocessSentenceForAudio } from '@/services/nlp';
import { audioBufferToURL } from '@/services/audio';

// Media globals
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

type AudioContextType = typeof window extends undefined
  ? never
  : (AudioContext);

interface TTSContextType {
  isPlaying: boolean;
  currentText: string;
  togglePlay: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  setText: (text: string) => void;
  currentSentence: string;
  audioQueue: AudioBuffer[];
  stop: () => void;
  stopAndPlayFromIndex: (index: number) => void;
  sentences: string[];
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  setSpeedAndRestart: (speed: number) => void;
  voice: string;
  setVoice: (voice: string) => void;
  setVoiceAndRestart: (voice: string) => void;
  availableVoices: string[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function TTSProvider({ children }: { children: React.ReactNode }) {
  const { apiKey: openApiKey, baseUrl: openApiBaseUrl, isLoading: configIsLoading } = useConfig();

  // Move openai initialization to a ref to avoid breaking hooks rules
  const openaiRef = useRef<OpenAI | null>(null);

  // All existing state declarations and refs stay at the top
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContextType>();
  const currentRequestRef = useRef<AbortController | null>(null);
  const [activeHowl, setActiveHowl] = useState<Howl | null>(null);
  const [audioQueue] = useState<AudioBuffer[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState('alloy');
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);

  // Audio cache using LRUCache with a maximum size of 50 entries
  const audioCacheRef = useRef(new LRUCache<string, AudioBuffer>({ max: 50 }));

  const setText = useCallback((text: string) => {
    setCurrentText(text);
    const newSentences = splitIntoSentences(text);
    setSentences(newSentences);
    setCurrentIndex(0);
    setIsPlaying(false);

    // Clear audio cache
    audioCacheRef.current.clear();
  }, []);

  const abortAudio = useCallback(() => {
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
      currentRequestRef.current = null;
    }

    if (activeHowl) {
      activeHowl.stop();
      setActiveHowl(null);
    }
  }, [currentRequestRef, activeHowl]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev) {
        return true;
      } else {
        abortAudio();
        return false;
      }
    });
  }, [abortAudio]);
  

  const skipForward = useCallback(() => {
    setIsProcessing(true);

    abortAudio();

    setCurrentIndex((prev) => {
      const nextIndex = Math.min(prev + 1, sentences.length - 1);
      console.log('Skipping forward to:', sentences[nextIndex]);
      return nextIndex;
    });

    setIsProcessing(false);
  }, [sentences, abortAudio]);

  const skipBackward = useCallback(() => {
    setIsProcessing(true);

    abortAudio();

    setCurrentIndex((prev) => {
      const nextIndex = Math.max(prev - 1, 0);
      console.log('Skipping backward to:', sentences[nextIndex]);
      return nextIndex;
    });
    

    setIsProcessing(false);
  }, [sentences, abortAudio]);

  // Initialize OpenAI instance when config loads
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await fetch(`${openApiBaseUrl}/audio/voices`, {
          headers: {
            'Authorization': `Bearer ${openApiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) throw new Error('Failed to fetch voices');
        const data = await response.json();
        setAvailableVoices(data.voices || []);
      } catch (error) {
        console.error('Error fetching voices:', error);

        // Set available voices to default openai voices
        // Supported voices are alloy, ash, coral, echo, fable, onyx, nova, sage and shimmer
        setAvailableVoices(['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']);
      }
    };

    if (!configIsLoading && openApiKey && openApiBaseUrl) {
      openaiRef.current = new OpenAI({
        apiKey: openApiKey,
        baseURL: openApiBaseUrl,
        dangerouslyAllowBrowser: true,
      });
      fetchVoices();
    }
  }, [configIsLoading, openApiKey, openApiBaseUrl]);

  useEffect(() => {
    /*
     * Initializes the AudioContext for text-to-speech playback.
     * Creates a new AudioContext instance if one doesn't exist.
     * Only runs on the client side to avoid SSR issues.
     * 
     * Dependencies:
     * - audioContext: Re-runs if the audioContext is null or changes
     */
    if (typeof window !== 'undefined' && !audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          setAudioContext(new AudioContextClass());
        } catch (error) {
          console.error('Failed to initialize AudioContext:', error);
        }
      }
    }

    return () => {
      if (audioContext) {
        audioContext.close().catch((error) => {
          console.error('Error closing AudioContext:', error);
        });
      }
    }
  }, [audioContext]);

  // Now the MediaSession effect can use these functions
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Text to Speech',
        artist: 'OpenReader WebUI',
        album: 'Current Reading',
        artwork: [
          {
            src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            type: 'image/png',
          },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('nexttrack', () => skipForward());
      navigator.mediaSession.setActionHandler('previoustrack', () => skipBackward());
    }
  }, [togglePlay, skipForward, skipBackward]);

  const advance = useCallback(async () => {
    setCurrentIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex < sentences.length) {
        console.log('Auto-advancing to next sentence:', sentences[nextIndex]);
        return nextIndex;
      }
      return prev;
    });
  }, [sentences]);

  //new function to return audio buffer with caching
  const getAudio = useCallback(async (sentence: string): Promise<AudioBuffer | undefined> => {
    // Check if the audio is already cached
    const cachedAudio = audioCacheRef.current.get(sentence);
    if (cachedAudio) {
      console.log('Using cached audio for sentence:', sentence);
      return cachedAudio;
    }

    // If not cached, fetch the audio from OpenAI API
    if (openaiRef.current) {
      console.log('Requesting audio for sentence:', sentence);

      const response = await openaiRef.current.audio.speech.create({
        model: 'tts-1',
        voice: voice as "alloy",
        input: sentence,
        speed: speed,
      });

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);

      // Cache the audio buffer
      audioCacheRef.current.set(sentence, audioBuffer);

      return audioBuffer;
    }
  }, [audioContext, voice, speed]);

  const processSentence = useCallback(async (sentence: string, preload = false): Promise<string> => {
    if (isProcessing && !preload) throw new Error('Audio is already being processed');
    if (!audioContext || !openaiRef.current) throw new Error('Audio context not initialized');
    
    // Only set processing state if not preloading
    if (!preload) setIsProcessing(true);
  
    try {
      const cleanedSentence = preprocessSentenceForAudio(sentence);
      currentRequestRef.current = new AbortController();
  
      const audioBuffer = await getAudio(cleanedSentence);
      if (!currentRequestRef.current) throw new Error('Request was cancelled');
      
  
      return audioBufferToURL(audioBuffer!);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled');
      }
      throw error;
    } finally {
      currentRequestRef.current = null;
    }
  }, [isProcessing, audioContext, getAudio]);

  const playSentenceWithHowl = useCallback(async (sentence: string) => {
    try {
      const audioUrl = await processSentence(sentence);
      if (!audioUrl) {
        throw new Error('No audio URL generated');
      }
  
      // Set processing to false before creating the Howl instance
      setIsProcessing(false);
  
      const howl = new Howl({
        src: [audioUrl],
        format: ['wav'],
        html5: true,
        onplay: () => {
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        },
        onpause: () => {
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
        },
        onend: () => {
          URL.revokeObjectURL(audioUrl);
          setActiveHowl(null);
          if (isPlaying) {
            advance();
          }
        },
        onloaderror: (id, error) => {
          console.error('Error loading audio:', error);
          setIsProcessing(false);
          setActiveHowl(null);
          URL.revokeObjectURL(audioUrl);
          // Don't auto-advance on load error
          setIsPlaying(false);
        },
      });
  
      setActiveHowl(howl);
      howl.play();
  
    } catch (error) {
      console.error('Error playing TTS:', error);
      setActiveHowl(null);
      setIsProcessing(false);
      setIsPlaying(false); // Stop playback on error
      
      if (error instanceof Error && 
         (error.message.includes('Unable to decode audio data') || 
          error.message.includes('EncodingError'))) {
        console.log('Skipping problematic sentence:', sentence.substring(0, 50) + '...');
        advance();
      }
    }
  }, [isPlaying, processSentence, advance]);

  const preloadNextAudio = useCallback(async () => {
    try {
      // Only preload next sentence to reduce API load
      if (sentences[currentIndex + 1] && !audioCacheRef.current.has(sentences[currentIndex + 1])) {
        await new Promise((resolve) => setTimeout(resolve, 200)); // Add small delay
        await processSentence(sentences[currentIndex + 1], true); // True indicates preloading
      }
    } catch (error) {
      console.error('Error preloading next sentence:', error);
    }
  }, [currentIndex, sentences, audioCacheRef, processSentence]);

  const playAudio = useCallback(async () => {
    //if (isPlaying && sentences[currentIndex] && !isProcessing) {
    await playSentenceWithHowl(sentences[currentIndex]);
    //}
  }, [sentences, currentIndex, playSentenceWithHowl]);

  // main driver useEffect
  useEffect(() => {
    if (!sentences[currentIndex]) {
      return; // Don't proceed if no valid sentence
    }
  
    if (isPlaying && !isProcessing && !activeHowl) {
      playAudio();
      if (isPlaying) { // Only preload if still playing
        preloadNextAudio().catch(console.error);
      }
    }
  
    return () => {
      abortAudio();
    };
  }, [
    isPlaying,
    isProcessing,
    currentIndex,
    sentences,
    playAudio,
    preloadNextAudio,
    abortAudio
  ]);

  const stop = useCallback(() => {
    // Cancel any ongoing request
    abortAudio();

    setIsPlaying(false);
    setCurrentIndex(0);
    setCurrentText('');
    setIsProcessing(false);
  }, [abortAudio]);

  const stopAndPlayFromIndex = useCallback((index: number) => {
    abortAudio();
    
    // Set the states in the next tick to ensure clean state
    setTimeout(() => {
      setCurrentIndex(index);
      setIsPlaying(true);
    }, 50);
  }, [abortAudio]);

  const setCurrentIndexWithoutPlay = useCallback((index: number) => {
    abortAudio();

    setCurrentIndex(index);
  }, [abortAudio]);

  const setSpeedAndRestart = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    // Clear the audio cache since it contains audio at the old speed
    audioCacheRef.current.clear();

    if (isPlaying) {
      const currentIdx = currentIndex;
      stop();
      // Small delay to ensure audio is fully stopped
      setTimeout(() => {
        setCurrentIndex(currentIdx);
        setIsPlaying(true);
      }, 50);
    }
  }, [isPlaying, currentIndex, stop]);

  const setVoiceAndRestart = useCallback((newVoice: string) => {
    setVoice(newVoice);
    // Clear the audio cache since it contains audio with the old voice
    audioCacheRef.current.clear();

    if (isPlaying) {
      const currentIdx = currentIndex;
      stop();
      // Small delay to ensure audio is fully stopped
      setTimeout(() => {
        setCurrentIndex(currentIdx);
        setIsPlaying(true);
      }, 50);
    }
  }, [isPlaying, currentIndex, stop]);

  const value = {
    isPlaying,
    currentText,
    togglePlay,
    skipForward,
    skipBackward,
    setText,
    currentSentence: sentences[currentIndex] || '',
    audioQueue,
    stop,
    setCurrentIndex: setCurrentIndexWithoutPlay,
    stopAndPlayFromIndex,
    sentences,
    isProcessing,
    setIsProcessing,
    setIsPlaying,
    speed,
    setSpeed,
    setSpeedAndRestart,
    voice,
    setVoice,
    setVoiceAndRestart,
    availableVoices,
    currentIndex,
  };

  if (configIsLoading) {
    return null;
  }

  return (
    <TTSContext.Provider value={value}>
      {children}
    </TTSContext.Provider>
  );
}

export function useTTS() {
  const context = useContext(TTSContext);
  if (context === undefined) {
    throw new Error('useTTS must be used within a TTSProvider');
  }
  return context;
}