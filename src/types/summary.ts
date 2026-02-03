export type SummarizeMode = 'current_page' | 'select_page' | 'whole_book';

export interface SummaryRow {
  id: string;
  docId: string;
  docType: 'pdf' | 'epub' | 'html';
  scope: 'page' | 'book';
  pageNumber: number | null;
  summary: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface SummarizeRequest {
  text: string;
  mode: SummarizeMode;
  maxLength?: number;
  isChunk?: boolean;
  isFinalPass?: boolean;
}

export interface SummarizeResponse {
  summary: string;
  provider: string;
  model: string;
  tokensUsed?: number;
  chunksProcessed?: number;
  totalChunks?: number;
}

export interface SummarizeError {
  code: string;
  message: string;
  details?: string;
}

export interface ChunkSummaryProgress {
  currentChunk: number;
  totalChunks: number;
  phase: 'chunking' | 'summarizing' | 'combining' | 'complete';
  message: string;
}
