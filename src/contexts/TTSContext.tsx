/**
 * Text-to-Speech (TTS) Context Provider
 * 
 * This module provides a React context for managing text-to-speech functionality.
 * It handles audio playback, sentence processing, and integration with OpenAI's TTS API.
 * 
 * Key features:
 * - Audio playback control (play/pause/skip)
 * - Sentence-by-sentence processing
 * - Audio caching for better performance
 * - Voice and speed control
 * - Document navigation
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
  ReactElement
} from 'react';
import { Howl } from 'howler';
import toast from 'react-hot-toast';
import { useParams } from 'next/navigation';

import { useConfig } from '@/contexts/ConfigContext';
import { useAudioCache } from '@/hooks/audio/useAudioCache';
import { useVoiceManagement } from '@/hooks/audio/useVoiceManagement';
import { useMediaSession } from '@/hooks/audio/useMediaSession';
import { useAudioContext } from '@/hooks/audio/useAudioContext';
import { getLastDocumentLocation, setLastDocumentLocation } from '@/utils/indexedDB';
import { useBackgroundState } from '@/hooks/audio/useBackgroundState';
import { withRetry } from '@/utils/audio';
import { processTextToSentences } from '@/utils/nlp';

// Media globals
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

/**
 * Interface defining all available methods and properties in the TTS context
 */
interface TTSContextType {
  // Playback state
  isPlaying: boolean;
  isProcessing: boolean;
  currentSentence: string;
  isBackgrounded: boolean;  // Add this new property

  // Navigation
  currDocPage: string | number;  // Change this to allow both types
  currDocPageNumber: number; // For PDF
  currDocPages: number | undefined;

  // Voice settings
  availableVoices: string[];

  // Control functions
  togglePlay: () => void;
  skipForward: () => void;
  skipBackward: () => void;
  pause: () => void;
  stop: () => void;
  stopAndPlayFromIndex: (index: number) => void;
  setText: (text: string, shouldPause?: boolean) => void;
  setCurrDocPages: (num: number | undefined) => void;
  setSpeedAndRestart: (speed: number) => void;
  setAudioPlayerSpeedAndRestart: (speed: number) => void;
  setVoiceAndRestart: (voice: string) => void;
  skipToLocation: (location: string | number, shouldPause?: boolean) => void;
  registerLocationChangeHandler: (handler: (location: string | number) => void) => void;  // EPUB-only: Handles chapter navigation
  setIsEPUB: (isEPUB: boolean) => void;
}

// Create the context
const TTSContext = createContext<TTSContextType | undefined>(undefined);

/**
 * Main provider component that manages the TTS state and functionality.
 * Handles initialization of OpenAI client, audio context, and media session.
 * 
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components to be wrapped by the provider
 * @returns {JSX.Element} TTSProvider component
 */
export function TTSProvider({ children }: { children: ReactNode }): ReactElement {
  // Configuration context consumption
  const {
    apiKey: openApiKey,
    baseUrl: openApiBaseUrl,
    isLoading: configIsLoading,
    voiceSpeed,
    audioPlayerSpeed,
    voice: configVoice,
    ttsProvider: configTTSProvider,
    ttsModel: configTTSModel,
    ttsInstructions: configTTSInstructions,
    updateConfigKey,
    skipBlank,
  } = useConfig();

  // Remove OpenAI client reference as it's no longer needed
  const audioContext = useAudioContext();
  const audioCache = useAudioCache(25);
  const { availableVoices, fetchVoices } = useVoiceManagement(openApiKey, openApiBaseUrl, configTTSProvider, configTTSModel);

  // Add ref for location change handler
  const locationChangeHandlerRef = useRef<((location: string | number) => void) | null>(null);

  /**
   * Registers a handler function for location changes in EPUB documents
   * This is only used for EPUB documents to handle chapter navigation
   * 
   * @param {Function} handler - Function to handle location changes
   */
  const registerLocationChangeHandler = useCallback((handler: (location: string | number) => void) => {
    locationChangeHandlerRef.current = handler;
  }, []);

  // Get document ID from URL params
  const { id } = useParams();

  /**
   * State Management
   */
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEPUB, setIsEPUB] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [currDocPage, setCurrDocPage] = useState<string | number>(1);
  const currDocPageNumber = (!isEPUB ? parseInt(currDocPage.toString()) : 1); // PDF uses numbers only
  const [currDocPages, setCurrDocPages] = useState<number>();

  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeHowl, setActiveHowl] = useState<Howl | null>(null);
  const [speed, setSpeed] = useState(voiceSpeed);
  const [audioSpeed, setAudioSpeed] = useState(audioPlayerSpeed);
  const [voice, setVoice] = useState(configVoice);
  const [ttsModel, setTTSModel] = useState(configTTSModel);
  const [ttsInstructions, setTTSInstructions] = useState(configTTSInstructions);

  // Track pending preload requests
  const preloadRequests = useRef<Map<string, Promise<string>>>(new Map());
  // Track active abort controllers for TTS requests
  const activeAbortControllers = useRef<Set<AbortController>>(new Set());
  // Track if we're restoring from a saved position
  const [pendingRestoreIndex, setPendingRestoreIndex] = useState<number | null>(null);

  /**
   * Processes text into sentences using the shared NLP utility
   * 
   * @param {string} text - The text to be processed
   * @returns {Promise<string[]>} Array of processed sentences
   */
  const processTextToSentencesLocal = useCallback(async (text: string): Promise<string[]> => {
    if (text.length < 1) {
      return [];
    }

    // Use the shared utility directly instead of making an API call
    return processTextToSentences(text);
  }, []);

  /**
   * Stops the current audio playback and clears the active Howl instance
   * @param {boolean} [clearPending=false] - Whether to clear pending requests
   */
  const abortAudio = useCallback((clearPending = false) => {
    if (activeHowl) {
      activeHowl.stop();
      activeHowl.unload(); // Ensure Howl instance is fully cleaned up
      setActiveHowl(null);
    }

    if (clearPending) {
      // Abort all active TTS requests
      console.log('Aborting active TTS requests');
      activeAbortControllers.current.forEach(controller => {
        controller.abort();
      });
      activeAbortControllers.current.clear();
      // Clear any pending preload requests
      preloadRequests.current.clear();
    }
  }, [activeHowl]);

  /**
   * Pauses the current audio playback
   * Used for external control of playback state
   */
  const pause = useCallback(() => {
    abortAudio();
    setIsPlaying(false);
  }, [abortAudio]);

  /**
   * Navigates to a specific location in the document
   * Works for both PDF pages and EPUB locations
   * 
   * @param {string | number} location - The target location to navigate to
   * @param {boolean} keepPlaying - Whether to maintain playback state
   */
  const skipToLocation = useCallback((location: string | number, shouldPause = false) => {
    // Reset state for new content in correct order
    abortAudio();
    if (shouldPause) setIsPlaying(false);
    setCurrentIndex(0);
    setSentences([]);
    setCurrDocPage(location);

  }, [abortAudio]);

  /**
   * Moves to the next or previous sentence
   * 
   * @param {boolean} [backwards=false] - Whether to move backwards
   */
  const advance = useCallback(async (backwards = false) => {
    const nextIndex = currentIndex + (backwards ? -1 : 1);

    // Handle within current page bounds
    if (nextIndex < sentences.length && nextIndex >= 0) {
      console.log('isEPUB', isEPUB!);
      setCurrentIndex(nextIndex);
      return;
    }

    // For EPUB documents, always try to advance to next/prev section
    if (isEPUB && locationChangeHandlerRef.current) {
      locationChangeHandlerRef.current(nextIndex >= sentences.length ? 'next' : 'prev');
      return;
    }

    // For PDFs and other documents, check page bounds
    if (!isEPUB) {
      // Handle next/previous page transitions
      if ((nextIndex >= sentences.length && currDocPageNumber < currDocPages!) ||
        (nextIndex < 0 && currDocPageNumber > 1)) {
        // Pass wasPlaying to maintain playback state during page turn
        skipToLocation(currDocPageNumber + (nextIndex >= sentences.length ? 1 : -1));
        return;
      }

      // Handle end of document (PDF only)
      if (nextIndex >= sentences.length && currDocPageNumber >= currDocPages!) {
        setIsPlaying(false);
      }
    }
  }, [currentIndex, sentences, currDocPageNumber, currDocPages, isEPUB, skipToLocation]);

  /**
   * Handles blank text sections based on document type
   * 
   * @param {string[]} sentences - Array of processed sentences
   * @returns {boolean} - True if blank section was handled
   */
  const handleBlankSection = useCallback((text: string): boolean => {
    if (!isPlaying || !skipBlank || text.length > 0) {
      return false;
    }

    // Use advance to handle navigation for both EPUB and PDF
    advance();

    toast.success(isEPUB ? 'Skipping blank section' : `Skipping blank page ${currDocPageNumber}`, {
      id: isEPUB ? `epub-section-skip` : `page-${currDocPageNumber}`,
      iconTheme: {
        primary: 'var(--accent)',
        secondary: 'var(--background)',
      },
      style: {
        background: 'var(--background)',
        color: 'var(--accent)',
      },
      duration: 1000,
      position: 'top-center',
    });

    return true;
  }, [isPlaying, skipBlank, advance, isEPUB, currDocPageNumber]);

  /**
   * Sets the current text and splits it into sentences
   * 
   * @param {string} text - The text to be processed
   */
  const setText = useCallback((text: string, shouldPause = false) => {
    // Check for blank section first
    if (handleBlankSection(text)) return;

    // Keep track of previous state and pause playback
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    abortAudio(true); // Clear pending requests since text is changing
    setIsProcessing(true); // Set processing state before text processing starts

    console.log('Setting text:', text);
    processTextToSentencesLocal(text)
      .then(newSentences => {
        if (newSentences.length === 0) {
          console.warn('No sentences found in text');
          setIsProcessing(false);
          return;
        }

        // Set all state updates in a predictable order
        setSentences(newSentences);
        
        // Check if we have a pending restore index for PDF
        if (pendingRestoreIndex !== null && !isEPUB) {
          const restoreIndex = Math.min(pendingRestoreIndex, newSentences.length - 1);
          console.log(`Restoring sentence index: ${restoreIndex}`);
          setCurrentIndex(restoreIndex);
          setPendingRestoreIndex(null); // Clear the pending restore
        } else {
          setCurrentIndex(0);
        }
        
        setIsProcessing(false);

        // Restore playback state if needed
        if (!shouldPause && wasPlaying) {
          setIsPlaying(true);
        }
      })
      .catch(error => {
        console.warn('Error processing text:', error);
        setIsProcessing(false);
        toast.error('Failed to process text', {
          style: {
            background: 'var(--background)',
            color: 'var(--accent)',
          },
          duration: 3000,
        });
      });
  }, [isPlaying, handleBlankSection, abortAudio, processTextToSentencesLocal, pendingRestoreIndex, isEPUB]);

  /**
   * Toggles the playback state between playing and paused
   */
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


  /**
   * Moves forward one sentence in the text
   */
  const skipForward = useCallback(async () => {
    // Only show processing state if we're currently playing
    if (isPlaying) {
      setIsProcessing(true);
    }
    abortAudio(false); // Don't clear pending requests
    await advance();
  }, [isPlaying, abortAudio, advance]);

  /**
   * Moves backward one sentence in the text
   */
  const skipBackward = useCallback(async () => {
    // Only show processing state if we're currently playing
    if (isPlaying) {
      setIsProcessing(true);
    }
    abortAudio(false); // Don't clear pending requests
    await advance(true);
  }, [isPlaying, abortAudio, advance]);

  /**
   * Updates the voice and speed settings from the configuration
   */
  const updateVoiceAndSpeed = useCallback(() => {
    setVoice(configVoice);
    setSpeed(voiceSpeed);
    setAudioSpeed(audioPlayerSpeed);
  }, [configVoice, voiceSpeed, audioPlayerSpeed]);

  /**
   * Initializes configuration and fetches available voices
   */
  useEffect(() => {
    if (!configIsLoading) {
      fetchVoices();
      updateVoiceAndSpeed();
      setTTSModel(configTTSModel);
      setTTSInstructions(configTTSInstructions);
    }
  }, [configIsLoading, openApiKey, openApiBaseUrl, updateVoiceAndSpeed, fetchVoices, configTTSModel, configTTSInstructions]);

  /**
   * Validates that the current voice is in the available voices list
   * If voice is empty or invalid, use the first available voice (only in local state, don't save)
   */
  useEffect(() => {
    if (availableVoices.length > 0) {
      if (!voice || !availableVoices.includes(voice)) {
        console.log(`Voice "${voice || '(empty)'}" not found in available voices. Using "${availableVoices[0]}"`);
        setVoice(availableVoices[0]);
        // Don't save to config - just use it temporarily until user explicitly selects one
      }
    }
  }, [availableVoices, voice]);

  /**
   * Generates and plays audio for the current sentence
   * 
   * @param {string} sentence - The sentence to generate audio for
   * @returns {Promise<AudioBuffer | undefined>} The generated audio buffer
   */
  const getAudio = useCallback(async (sentence: string): Promise<ArrayBuffer | undefined> => {
    // Check if the audio is already cached
    const cachedAudio = audioCache.get(sentence);
    if (cachedAudio) {
      console.log('Using cached audio for sentence:', sentence.substring(0, 20));
      return cachedAudio;
    }

    try {
      console.log('Requesting audio for sentence:', sentence);

      // Create an AbortController for this request
      const controller = new AbortController();
      activeAbortControllers.current.add(controller);

      const arrayBuffer = await withRetry(
        async () => {
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-openai-key': openApiKey || '',
              'x-openai-base-url': openApiBaseUrl || '',
              'x-tts-provider': configTTSProvider,
            },
            body: JSON.stringify({
              text: sentence,
              voice: voice,
              speed: speed,
              model: ttsModel,
              instructions: ttsModel === 'gpt-4o-mini-tts' ? ttsInstructions : undefined
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error('Failed to generate audio');
          }

          return response.arrayBuffer();
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 5000,
          backoffFactor: 2
        }
      );

      // Remove the controller once the request is complete
      activeAbortControllers.current.delete(controller);

      // Cache the array buffer
      audioCache.set(sentence, arrayBuffer);

      return arrayBuffer;
    } catch (error) {
      // Check if this was an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('TTS request aborted:', sentence.substring(0, 20));
        return;
      }

      setIsPlaying(false);
      toast.error('Failed to generate audio. Server not responding.', {
        id: 'tts-api-error',
        style: {
          background: 'var(--background)',
          color: 'var(--accent)',
        },
        duration: 7000,
      });
      throw error;
    }
  }, [voice, speed, ttsModel, ttsInstructions, audioCache, openApiKey, openApiBaseUrl, configTTSProvider]);

  /**
   * Processes and plays the current sentence
   * 
   * @param {string} sentence - The sentence to process
   * @param {boolean} [preload=false] - Whether this is a preload request
   * @returns {Promise<string>} The URL of the processed audio
   */
  const processSentence = useCallback(async (sentence: string, preload = false): Promise<string> => {
    if (!audioContext) throw new Error('Audio context not initialized');

    // Check if there's a pending preload request for this sentence
    const pendingRequest = preloadRequests.current.get(sentence);
    if (pendingRequest) {
      console.log('Using pending preload request for:', sentence.substring(0, 20));
      setIsProcessing(true); // Show processing state when using pending request
      // If this is not a preload request, remove it from the pending map
      if (!preload) {
        preloadRequests.current.delete(sentence);
      }
      return pendingRequest;
    }

    // Only set processing state if not preloading
    if (!preload) setIsProcessing(true);

    // Create the audio processing promise
    const processPromise = (async () => {
      try {
        const audioBuffer = await getAudio(sentence);
        if (!audioBuffer) throw new Error('No audio data generated');
        
        // Convert to base64 data URI
        const bytes = new Uint8Array(audioBuffer);
        const binaryString = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
        const base64String = btoa(binaryString);
        return `data:audio/mp3;base64,${base64String}`;
      } catch (error) {
        setIsProcessing(false);
        throw error;
      }
    })();

    // If this is a preload request, store it in the map
    if (preload) {
      preloadRequests.current.set(sentence, processPromise);
      // Clean up the map entry once the promise resolves or rejects
      processPromise.finally(() => {
        preloadRequests.current.delete(sentence);
      });
    }

    return processPromise;
  }, [audioContext, getAudio]);

  /**
   * Plays the current sentence with Howl
   * 
   * @param {string} sentence - The sentence to play
   */
  const playSentenceWithHowl = useCallback(async (sentence: string) => {
    if (!sentence) {
      console.log('No sentence to play');
      setIsProcessing(false);
      return;
    }

    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 1000; // 1 second

    const createHowl = async (retryCount = 0): Promise<Howl | null> => {
      try {
        // Get the processed audio data URI directly from processSentence
        const audioDataUri = await processSentence(sentence);
        if (!audioDataUri) {
          throw new Error('No audio data generated');
        }

        // Force unload any previous Howl instance to free up resources
        if (activeHowl) {
          activeHowl.unload();
        }

        return new Howl({
          src: [audioDataUri],
          format: ['mp3', 'mpeg'],
          html5: true,
          preload: true,
          pool: 5,
          rate: audioSpeed,
          onplay: () => {
            setIsProcessing(false);
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'playing';
            }
          },
          onplayerror: function(this: Howl, error) {
            console.warn('Howl playback error:', error);
            // Try to recover by forcing HTML5 audio mode
            if (this.state() === 'loaded') {
              this.unload();
              this.once('load', () => {
                this.play();
              });
              this.load();
            }
          },
          onloaderror: async function(this: Howl, error) {
            console.warn(`Error loading audio (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
            
            if (retryCount < MAX_RETRIES) {
              // Calculate exponential backoff delay
              const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
              console.log(`Retrying in ${delay}ms...`);
              
              // Wait for the delay
              await new Promise(resolve => setTimeout(resolve, delay));
              
              // Try to create a new Howl instance
              const retryHowl = await createHowl(retryCount + 1);
              if (retryHowl) {
                setActiveHowl(retryHowl);
                retryHowl.play();
              }
            } else {
              console.error('Max retries reached, moving to next sentence');
              setIsProcessing(false);
              setActiveHowl(null);
              this.unload();
              setIsPlaying(false);
              
              toast.error('Audio loading failed after retries. Moving to next sentence...', {
                id: 'audio-load-error',
                style: {
                  background: 'var(--background)',
                  color: 'var(--accent)',
                },
                duration: 2000,
              });
              
              advance();
            }
          },
          onend: function(this: Howl) {
            this.unload();
            setActiveHowl(null);
            if (isPlaying) {
              advance();
            }
          },
          onstop: function(this: Howl) {
            setIsProcessing(false);
            this.unload();
          }
        });
      } catch (error) {
        console.error('Error creating Howl instance:', error);
        return null;
      }
    };

    try {
      const howl = await createHowl();
      if (howl) {
        setActiveHowl(howl);
        return howl;
      }

      throw new Error('Failed to create Howl instance');
    } catch (error) {
      console.error('Error playing TTS:', error);
      setActiveHowl(null);
      setIsProcessing(false);

      toast.error('Failed to process audio. Skipping problematic sentence.', {
        id: 'tts-processing-error',
        style: {
          background: 'var(--background)',
          color: 'var(--accent)',
        },
        duration: 3000,
      });

      advance();
      return null;
    }
  }, [isPlaying, advance, activeHowl, processSentence, audioSpeed]);

  const playAudio = useCallback(async () => {
    const howl = await playSentenceWithHowl(sentences[currentIndex]);
    if (howl) {
      howl.play();
    }
  }, [sentences, currentIndex, playSentenceWithHowl]);

  // Place useBackgroundState after playAudio is defined
  const isBackgrounded = useBackgroundState({
    activeHowl,
    isPlaying,
    playAudio,
  });

  /**
   * Preloads the next sentence's audio
   */
  const preloadNextAudio = useCallback(async () => {
    try {
      const nextSentence = sentences[currentIndex + 1];
      if (nextSentence && !audioCache.has(nextSentence) && !preloadRequests.current.has(nextSentence)) {
        // Start preloading but don't wait for it to complete
        processSentence(nextSentence, true).catch(error => {
          console.error('Error preloading next sentence:', error);
        });
      }
    } catch (error) {
      console.error('Error initiating preload:', error);
    }
  }, [currentIndex, sentences, audioCache, processSentence]);

  /**
   * Main Playback Driver
   * Controls the flow of audio playback and sentence processing
   */
  useEffect(() => {
    if (!isPlaying) return; // Don't proceed if stopped
    if (isProcessing) return; // Don't proceed if processing audio
    if (!sentences[currentIndex]) return; // Don't proceed if no sentence to play
    if (activeHowl) return; // Don't proceed if audio is already playing
    if (isBackgrounded) return; // Don't proceed if backgrounded

    // Start playing current sentence
    playAudio();

    // Start preloading next sentence in parallel
    preloadNextAudio();

    return () => {
      // Only abort if we're actually stopping playback
      if (!isPlaying) {
        abortAudio();
      }
    };
  }, [
    isPlaying,
    isProcessing,
    currentIndex,
    sentences,
    activeHowl,
    isBackgrounded,
    playAudio,
    preloadNextAudio,
    abortAudio
  ]);

  /**
   * Stops the current audio playback and resets all state
   */
  const stop = useCallback(() => {
    // Cancel any ongoing request
    abortAudio();
    locationChangeHandlerRef.current = null;
    setIsPlaying(false);
    setCurrentIndex(0);
    setSentences([]);
    setCurrDocPage(1);
    setCurrDocPages(undefined);
    setIsProcessing(false);
    setIsEPUB(false);
  }, [abortAudio]);

  /**
   * Stops the current audio playback and starts playing from a specified index
   * 
   * @param {number} index - The index to start playing from
   */
  const stopAndPlayFromIndex = useCallback((index: number) => {
    abortAudio();

    setCurrentIndex(index);
    setIsPlaying(true);
  }, [abortAudio]);

  /**
   * Sets the speed and restarts the playback
   * 
   * @param {number} newSpeed - The new speed to set
   */
  const setSpeedAndRestart = useCallback((newSpeed: number) => {
    const wasPlaying = isPlaying;

    // Set a flag to prevent double audio requests during config update
    setIsProcessing(true);

    // First stop any current playback
    setIsPlaying(false);
    abortAudio(true); // Clear pending requests since speed changed
    setActiveHowl(null);

    // Update speed, clear cache, and config
    setSpeed(newSpeed);
    audioCache.clear();

    // Update config after state changes
    updateConfigKey('voiceSpeed', newSpeed).then(() => {
      setIsProcessing(false);
      // Resume playback if it was playing before
      if (wasPlaying) {
        setIsPlaying(true);
      }
    });
  }, [abortAudio, updateConfigKey, audioCache, isPlaying]);

  /**
   * Sets the voice and restarts the playback
   * 
   * @param {string} newVoice - The new voice to set
   */
  const setVoiceAndRestart = useCallback((newVoice: string) => {
    const wasPlaying = isPlaying;

    // Set a flag to prevent double audio requests during config update
    setIsProcessing(true);

    // First stop any current playback
    setIsPlaying(false);
    abortAudio(true); // Clear pending requests since voice changed
    setActiveHowl(null);

    // Update voice, clear cache, and config
    setVoice(newVoice);
    audioCache.clear();

    // Update config after state changes
    updateConfigKey('voice', newVoice).then(() => {
      setIsProcessing(false);
      // Resume playback if it was playing before
      if (wasPlaying) {
        setIsPlaying(true);
      }
    });
  }, [abortAudio, updateConfigKey, audioCache, isPlaying]);

  /**
   * Sets the audio player speed and restarts the playback
   * 
   * @param {number} newSpeed - The new audio player speed to set
   */
  const setAudioPlayerSpeedAndRestart = useCallback((newSpeed: number) => {
    const wasPlaying = isPlaying;

    // Set a flag to prevent double audio requests during config update
    setIsProcessing(true);

    // First stop any current playback
    setIsPlaying(false);
    abortAudio(true); // Clear pending requests since speed changed
    setActiveHowl(null);

    // Update audio speed and config
    setAudioSpeed(newSpeed);

    // Update config after state changes
    updateConfigKey('audioPlayerSpeed', newSpeed).then(() => {
      setIsProcessing(false);
      // Resume playback if it was playing before
      if (wasPlaying) {
        setIsPlaying(true);
      }
    });
  }, [abortAudio, updateConfigKey, isPlaying]);

  /**
   * Provides the TTS context value to child components
   */
  const value = useMemo(() => ({
    isPlaying,
    isProcessing,
    isBackgrounded,
    currentSentence: sentences[currentIndex] || '',
    currDocPage,
    currDocPageNumber,
    currDocPages,
    availableVoices,
    togglePlay,
    skipForward,
    skipBackward,
    stop,
    pause,
    stopAndPlayFromIndex,
    setText,
    setCurrDocPages,
    setSpeedAndRestart,
    setAudioPlayerSpeedAndRestart,
    setVoiceAndRestart,
    skipToLocation,
    registerLocationChangeHandler,
    setIsEPUB
  }), [
    isPlaying,
    isProcessing,
    isBackgrounded,
    sentences,
    currentIndex,
    currDocPage,
    currDocPageNumber,
    currDocPages,
    availableVoices,
    togglePlay,
    skipForward,
    skipBackward,
    stop,
    pause,
    stopAndPlayFromIndex,
    setText,
    setCurrDocPages,
    setSpeedAndRestart,
    setAudioPlayerSpeedAndRestart,
    setVoiceAndRestart,
    skipToLocation,
    registerLocationChangeHandler,
    setIsEPUB
  ]);

  // Use media session hook
  useMediaSession({
    togglePlay,
    skipForward,
    skipBackward,
  });

  // Load last location on mount for both EPUB and PDF
  useEffect(() => {
    if (id) {
      getLastDocumentLocation(id as string).then(lastLocation => {
        if (lastLocation) {
          console.log('Setting last location:', lastLocation);
          
          if (isEPUB && locationChangeHandlerRef.current) {
            // For EPUB documents, use the location change handler
            locationChangeHandlerRef.current(lastLocation);
          } else if (!isEPUB) {
            // For PDF documents, parse the location as "page:sentence"
            try {
              const [pageStr, sentenceIndexStr] = lastLocation.split(':');
              const page = parseInt(pageStr, 10);
              const sentenceIndex = parseInt(sentenceIndexStr, 10);
              
              if (!isNaN(page) && !isNaN(sentenceIndex)) {
                console.log(`Restoring PDF position: page ${page}, sentence ${sentenceIndex}`);
                // Skip to the page first, then the sentence index will be restored when setText is called
                setCurrDocPage(page);
                // Store the sentence index to be used when text is loaded
                setPendingRestoreIndex(sentenceIndex);
              }
            } catch (error) {
              console.warn('Error parsing PDF location:', error);
            }
          }
        }
      });
    }
  }, [id, isEPUB]);

  // Save current position periodically for PDFs
  useEffect(() => {
    if (id && !isEPUB && sentences.length > 0) {
      const location = `${currDocPageNumber}:${currentIndex}`;
      const timeoutId = setTimeout(() => {
        console.log(`Saving PDF position: ${location}`);
        setLastDocumentLocation(id as string, location).catch(error => {
          console.warn('Error saving PDF location:', error);
        });
      }, 1000); // Debounce saves by 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [id, isEPUB, currDocPageNumber, currentIndex, sentences.length]);

  /**
   * Renders the TTS context provider with its children
   * 
   * @param {ReactNode} children - Child components to be wrapped
   * @returns {JSX.Element}
   */
  return (
    <TTSContext.Provider value={value}>
      {children}
    </TTSContext.Provider>
  );
}

/**
 * Custom hook to consume the TTS context
 * Ensures the context is used within a provider
 * 
 * @throws {Error} If used outside of TTSProvider
 * @returns {TTSContextType} The TTS context value
 */
export function useTTS() {
  const context = useContext(TTSContext);
  if (context === undefined) {
    throw new Error('useTTS must be used within a TTSProvider');
  }
  return context;
}