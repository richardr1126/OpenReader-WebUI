export type SummarizeMode = 'current_page' | 'select_page' | 'whole_book';
export type SummaryProvider = 'openai' | 'anthropic' | 'custom-openai';

export interface SummaryRow {
  id: string;           // `${docId}-${scope}-${pageNumber ?? 'all'}`
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
}

export interface SummarizeResponse {
  summary: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

export interface SummarizeError {
  code: string;
  message: string;
  details?: string;
}
