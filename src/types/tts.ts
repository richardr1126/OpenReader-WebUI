export type TTSLocation = string | number;

// Standardized error codes for the TTS API
export type TTSErrorCode =
  | 'MISSING_PARAMETERS'
  | 'INVALID_REQUEST'
  | 'TTS_GENERATION_FAILED'
  | 'ABORTED'
  | 'INTERNAL_ERROR';

// Structured error object returned by the TTS API
export interface TTSError {
  code: TTSErrorCode;
  message: string;
  details?: unknown;
}

// Supported output formats for the TTS endpoint
export type TTSRequestFormat = 'mp3' | 'aac';

// JSON payload accepted by the /api/tts endpoint
export interface TTSRequestPayload {
  text: string;
  voice: string;
  speed: number;
  model?: string | null;
  format?: TTSRequestFormat;
  instructions?: string;
}

// Headers used when calling the /api/tts endpoint from the client
export type TTSRequestHeaders = Record<string, string>;

// Core playback state exposed by the TTS context
export interface TTSPlaybackState {
  isPlaying: boolean;
  isProcessing: boolean;
  isBackgrounded: boolean;
  currentSentence: string;
  currDocPage: TTSLocation;
  currDocPageNumber: number;
  currDocPages?: number;
}

// Options for retrying TTS requests on failure in withRetry
export interface TTSRetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

// Result of merging a continuation slice into the current text
export interface TTSSmartMergeResult {
  text: string;
  carried: string;
}

// Estimate for when a visual page/section turn should occur during audio playback
export interface TTSPageTurnEstimate {
  location: TTSLocation;
  sentenceIndex: number;
  fraction: number;
}

// Word-level alignment within a single spoken sentence/block
export interface TTSSentenceWord {
  text: string;
  startSec: number;
  endSec: number;
  charStart: number;
  charEnd: number;
}

// Alignment metadata for a single TTS sentence/block
export interface TTSSentenceAlignment {
  sentence: string;
  sentenceIndex: number;
  words: TTSSentenceWord[];
}

// Metadata for an audiobook chapter
export interface TTSAudiobookChapter {
  index: number;
  title: string;
  duration?: number;
  status: 'pending' | 'generating' | 'completed' | 'error';
  bookId?: string;
  format?: 'mp3' | 'm4b';
}
