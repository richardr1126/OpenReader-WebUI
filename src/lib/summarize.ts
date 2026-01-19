import type { SummarizeMode, SummarizeResponse, SummarizeError } from '@/types/summary';

export interface SummarizeOptions {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export async function generateSummary(
  text: string,
  mode: SummarizeMode,
  options: SummarizeOptions,
  maxLength?: number
): Promise<SummarizeResponse> {
  // Build headers, only include API key if explicitly set (otherwise server uses env vars)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-summary-provider': options.provider,
    'x-summary-model': options.model,
  };

  // Only send API key if explicitly configured (empty = use server env var)
  if (options.apiKey) {
    headers['x-summary-api-key'] = options.apiKey;
  }

  // Only send base URL if configured
  if (options.baseUrl) {
    headers['x-summary-base-url'] = options.baseUrl;
  }

  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text,
      mode,
      maxLength,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as SummarizeError;
    throw new Error(error.message || 'Failed to generate summary');
  }

  return data as SummarizeResponse;
}
