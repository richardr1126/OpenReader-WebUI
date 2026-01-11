/**
 * Background job types for audiobook generation
 */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type JobType = 'audiobook-generation';

export interface AudiobookJobData {
  documentId: string;
  documentName: string;
  voice: string;
  speed: number;
  audioPlayerSpeed: number;
  ttsProvider: string;
  ttsModel: string;
  ttsInstructions?: string;
  format: 'mp3' | 'm4b';
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  data: AudiobookJobData;
  progress: number; // 0-100
  currentStep?: string; // Human-readable status
  error?: string;
  result?: {
    bookId: string;
    format: string;
    totalDuration: number;
    chapterCount: number;
  };
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface JobProgress {
  jobId: string;
  progress: number;
  currentStep: string;
  sentencesProcessed?: number;
  totalSentences?: number;
}
