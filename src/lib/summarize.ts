import type { SummarizeMode, SummarizeResponse, SummarizeError, ChunkSummaryProgress } from '@/types/summary';

export interface SummarizeOptions {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  contextLimit?: number;
}

// Estimate tokens (~4 chars per token)
export const estimateTokens = (text: string): number => Math.ceil((text?.length || 0) / 4);

// Max safe input (75% of limit for system prompt + output)
const getMaxInputTokens = (limit: number): number => Math.floor(limit * 0.75);

// Check if text needs chunking
export const needsChunking = (text: string, contextLimit: number): boolean =>
  estimateTokens(text) > getMaxInputTokens(contextLimit);

// Split text into chunks by paragraphs/sentences
function splitTextIntoChunks(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const chunks: string[] = [];
  let current = '';

  // Helper to split oversized text into multiple chunks
  function splitOversizedText(oversized: string): string[] {
    const parts: string[] = [];
    let remaining = oversized;
    while (remaining.length > 0) {
      // Try to split at sentence boundary within maxChars
      let splitPoint = maxChars;
      if (remaining.length > maxChars) {
        const searchRange = remaining.slice(0, maxChars);
        const lastSentence = Math.max(
          searchRange.lastIndexOf('. '),
          searchRange.lastIndexOf('! '),
          searchRange.lastIndexOf('? ')
        );
        if (lastSentence > maxChars * 0.5) {
          splitPoint = lastSentence + 2; // Include the punctuation and space
        }
      }
      parts.push(remaining.slice(0, splitPoint).trim());
      remaining = remaining.slice(splitPoint).trim();
    }
    return parts;
  }

  for (const para of text.split(/\n\n+/)) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((current + '\n\n' + trimmed).length > maxChars) {
      if (current) chunks.push(current.trim());
      // Handle oversized paragraphs by splitting them iteratively
      if (trimmed.length > maxChars) {
        const splitParts = splitOversizedText(trimmed);
        // Add all but the last part as separate chunks
        for (let i = 0; i < splitParts.length - 1; i++) {
          chunks.push(splitParts[i]);
        }
        // Use the last part as the new current
        current = splitParts[splitParts.length - 1] || '';
      } else {
        current = trimmed;
      }
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Make API request
async function callSummarizeAPI(
  text: string,
  mode: SummarizeMode,
  options: SummarizeOptions,
  flags?: { isChunk?: boolean; isFinalPass?: boolean },
  maxLength?: number
): Promise<SummarizeResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-summary-provider': options.provider,
    'x-summary-model': options.model,
  };
  if (options.apiKey) headers['x-summary-api-key'] = options.apiKey;
  if (options.baseUrl) headers['x-summary-base-url'] = options.baseUrl;

  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, mode, maxLength, ...flags }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error((data as SummarizeError).message || 'Failed to generate summary');
  return data as SummarizeResponse;
}

// Main summarization function with automatic chunking
export async function generateSummary(
  text: string,
  mode: SummarizeMode,
  options: SummarizeOptions,
  maxLength?: number,
  onProgress?: (progress: ChunkSummaryProgress) => void
): Promise<SummarizeResponse> {
  const contextLimit = options.contextLimit || 32768;

  // Direct summarization for small texts or non-whole-book modes
  if (mode !== 'whole_book' || !needsChunking(text, contextLimit)) {
    return callSummarizeAPI(text, mode, options, undefined, maxLength);
  }

  // Hierarchical summarization for large documents
  const maxInputTokens = getMaxInputTokens(contextLimit);
  const chunks = splitTextIntoChunks(text, maxInputTokens);
  
  onProgress?.({ currentChunk: 0, totalChunks: chunks.length, phase: 'chunking', message: `Splitting into ${chunks.length} chunks...` });

  // Summarize each chunk
  const summaries: string[] = [];
  let totalTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ currentChunk: i + 1, totalChunks: chunks.length, phase: 'summarizing', message: `Summarizing ${i + 1}/${chunks.length}...` });
    const result = await callSummarizeAPI(chunks[i], 'whole_book', options, { isChunk: true });
    summaries.push(result.summary);
    totalTokens += result.tokensUsed || 0;
  }

  // Combine summaries (recursively if still too large)
  onProgress?.({ currentChunk: chunks.length, totalChunks: chunks.length, phase: 'combining', message: 'Combining summaries...' });

  let combined = summaries.join('\n\n---\n\n');
  const MAX_COMBINING_ITERATIONS = 10;
  let combiningIterations = 0;

  while (needsChunking(combined, contextLimit)) {
    combiningIterations++;
    if (combiningIterations > MAX_COMBINING_ITERATIONS) {
      console.warn('Summary combining reached maximum iterations, proceeding with current result');
      break;
    }

    const previousLength = combined.length;
    const subChunks = splitTextIntoChunks(combined, maxInputTokens);
    const subSummaries: string[] = [];
    for (const chunk of subChunks) {
      const result = await callSummarizeAPI(chunk, 'whole_book', options, { isChunk: true });
      subSummaries.push(result.summary);
      totalTokens += result.tokensUsed || 0;
    }
    combined = subSummaries.join('\n\n---\n\n');

    // Guard against non-convergence: if combined didn't shrink, break to avoid infinite loop
    if (combined.length >= previousLength) {
      console.warn('Summary combining not converging, proceeding with current result');
      break;
    }
  }

  // Final pass
  const final = await callSummarizeAPI(combined, 'whole_book', options, { isFinalPass: true });
  
  onProgress?.({ currentChunk: chunks.length, totalChunks: chunks.length, phase: 'complete', message: 'Complete!' });

  return { ...final, tokensUsed: totalTokens + (final.tokensUsed || 0), chunksProcessed: chunks.length, totalChunks: chunks.length };
}
