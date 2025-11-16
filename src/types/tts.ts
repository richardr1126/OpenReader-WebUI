export type TTSLocation = string | number;

// Result of merging a continuation slice into the current text
export interface ContinuationMergeResult {
  text: string;
  carried: string;
}

// Estimate for when a visual page/section turn should occur during audio playback
export interface PageTurnEstimate {
  location: TTSLocation;
  sentenceIndex: number;
  fraction: number;
}

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

export interface TTSRetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}