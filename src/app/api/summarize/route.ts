import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import type { SummarizeRequest, SummarizeResponse, SummarizeError } from '@/types/summary';

export const runtime = 'nodejs';

// Default provider endpoints - these are the only allowed baseUrls in production
// unless SUMMARY_ALLOWED_BASE_URLS is configured
const PROVIDER_DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

// Parse allowed base URLs from environment variable (comma-separated)
function getAllowedBaseUrls(): string[] {
  const envUrls = process.env.SUMMARY_ALLOWED_BASE_URLS;
  if (!envUrls) return [];
  return envUrls.split(',').map(url => url.trim()).filter(Boolean);
}

// Validate baseUrl against allowlist in production
function validateBaseUrl(baseUrl: string, provider: string): string | null {
  // Empty baseUrl is always allowed - will use SDK defaults
  if (!baseUrl) {
    return null;
  }

  // In development, allow any baseUrl
  if (process.env.NODE_ENV !== 'production') {
    return baseUrl;
  }

  // Parse and normalize the URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    return null; // Invalid URL
  }

  // Only allow https in production
  if (parsedUrl.protocol !== 'https:') {
    return null;
  }

  const normalizedUrl = parsedUrl.origin + parsedUrl.pathname.replace(/\/$/, '');

  // Check against provider defaults
  const providerDefault = PROVIDER_DEFAULT_ENDPOINTS[provider];
  if (providerDefault && normalizedUrl === providerDefault) {
    return baseUrl;
  }

  // Check against configured allowlist
  const allowedUrls = getAllowedBaseUrls();
  for (const allowed of allowedUrls) {
    try {
      const allowedParsed = new URL(allowed);
      const normalizedAllowed = allowedParsed.origin + allowedParsed.pathname.replace(/\/$/, '');
      if (normalizedUrl === normalizedAllowed || normalizedUrl.startsWith(normalizedAllowed + '/')) {
        return baseUrl;
      }
    } catch {
      continue;
    }
  }

  // URL not in allowlist - return null to use provider default
  return null;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  current_page: `You are a helpful assistant that summarizes text content.
Provide a clear, concise summary of the current page content provided.
Focus on the main ideas and key points. Keep the summary focused and readable.
Do not include any preamble like "Here is a summary" - just provide the summary directly.`,

  select_page: `You are a helpful assistant that summarizes text content.
Provide a clear, concise summary of the selected page content provided.
Focus on the main ideas and key points. Keep the summary focused and readable.
Do not include any preamble like "Here is a summary" - just provide the summary directly.`,

  whole_book: `You are a helpful assistant that summarizes documents.
Provide a comprehensive summary of the entire document content provided.
Structure your summary with key themes, main arguments, and important conclusions.
For longer texts, organize the summary into logical sections.
Do not include any preamble like "Here is a summary" - just provide the summary directly.`,

  // For summarizing individual chunks of a large document
  chunk: `You are a helpful assistant that summarizes text content.
This is a portion of a larger document. Provide a detailed summary of this section.
Capture all key information, arguments, and details as they may be needed for the final summary.
Focus on factual content and main points. Be thorough but concise.
Do not include any preamble - just provide the summary directly.`,

  // For combining chunk summaries into a final cohesive summary
  final_pass: `You are a helpful assistant that creates comprehensive document summaries.
You are given summaries of different sections of a document, separated by "---".
Your task is to synthesize these section summaries into a single, cohesive, well-organized summary.
Structure the final summary with clear sections covering key themes, main arguments, and important conclusions.
Remove any redundancy while preserving all important information.
Do not include any preamble like "Here is a summary" - just provide the summary directly.`,
};

export async function POST(req: NextRequest) {
  try {
    // Get configuration from headers
    const provider = req.headers.get('x-summary-provider') || 'openai';
    const requestedBaseUrl = req.headers.get('x-summary-base-url') || '';
    const modelId = req.headers.get('x-summary-model') || 'gpt-4o-mini';

    // Validate and sanitize baseUrl - in production, only allow configured endpoints
    const baseUrl = validateBaseUrl(requestedBaseUrl, provider);
    if (requestedBaseUrl && !baseUrl && process.env.NODE_ENV === 'production') {
      console.warn(`Rejected untrusted baseUrl: ${requestedBaseUrl} for provider: ${provider}`);
    }

    // Get API key from headers or environment variables based on provider
    let apiKey = req.headers.get('x-summary-api-key') || '';
    if (!apiKey) {
      switch (provider) {
        case 'groq':
          apiKey = process.env.GROQ_API_KEY || '';
          break;
        case 'anthropic':
          apiKey = process.env.ANTHROPIC_API_KEY || '';
          break;
        case 'openrouter':
          apiKey = process.env.OPENROUTER_API_KEY || '';
          break;
        case 'openai':
        default:
          apiKey = process.env.OPENAI_API_KEY || process.env.SUMMARY_API_KEY || process.env.API_KEY || '';
          break;
      }
    }

    const body = (await req.json()) as SummarizeRequest;
    const { text, mode, maxLength, isChunk, isFinalPass } = body;

    console.log('Received summarize request:', { provider, modelId, mode, textLength: text?.length, isChunk, isFinalPass });

    if (!text) {
      const errorBody: SummarizeError = {
        code: 'MISSING_TEXT',
        message: 'No text provided for summarization',
      };
      return NextResponse.json(errorBody, { status: 400 });
    }

    if (!apiKey) {
      const errorBody: SummarizeError = {
        code: 'MISSING_API_KEY',
        message: 'No API key configured for summarization. Please configure your API key in Settings.',
      };
      return NextResponse.json(errorBody, { status: 400 });
    }

    // Select appropriate prompt based on chunking mode
    let systemPrompt: string;
    let userPrompt: string;

    if (isChunk) {
      // Summarizing an individual chunk
      systemPrompt = SYSTEM_PROMPTS.chunk;
      userPrompt = `Please summarize this section of the document:\n\n${text}`;
    } else if (isFinalPass) {
      // Combining chunk summaries into final summary
      systemPrompt = SYSTEM_PROMPTS.final_pass;
      userPrompt = `Please synthesize these section summaries into a comprehensive document summary:\n\n${text}`;
    } else {
      // Normal summarization
      systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.current_page;
      userPrompt = maxLength
        ? `Please summarize the following text in approximately ${maxLength} words:\n\n${text}`
        : `Please summarize the following text:\n\n${text}`;
    }

    let model;

    switch (provider) {
      case 'anthropic': {
        const anthropic = createAnthropic({
          apiKey,
          baseURL: baseUrl || undefined,
        });
        model = anthropic(modelId);
        break;
      }
      case 'groq': {
        const groq = createGroq({
          apiKey,
          baseURL: baseUrl || undefined,
        });
        model = groq(modelId);
        break;
      }
      case 'openrouter': {
        const openrouter = createOpenAI({
          apiKey,
          baseURL: baseUrl || 'https://openrouter.ai/api/v1',
        });
        model = openrouter(modelId);
        break;
      }
      case 'custom-openai': {
        if (!requestedBaseUrl) {
          const errorBody: SummarizeError = {
            code: 'MISSING_BASE_URL',
            message: 'Custom provider requires a base URL',
          };
          return NextResponse.json(errorBody, { status: 400 });
        }
        if (!baseUrl) {
          // URL was provided but rejected by validation
          const errorBody: SummarizeError = {
            code: 'INVALID_BASE_URL',
            message: 'The provided base URL is not allowed. In production, only configured endpoints are permitted.',
          };
          return NextResponse.json(errorBody, { status: 400 });
        }
        const customOpenAI = createOpenAI({
          apiKey: apiKey || 'not-needed',
          baseURL: baseUrl,
        });
        model = customOpenAI(modelId);
        break;
      }
      case 'openai':
      default: {
        const openai = createOpenAI({
          apiKey,
          baseURL: baseUrl || undefined,
        });
        model = openai(modelId);
        break;
      }
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const response: SummarizeResponse = {
      summary: result.text,
      provider,
      model: modelId,
      tokensUsed: result.usage?.totalTokens,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating summary:', error);

    const errorBody: SummarizeError = {
      code: 'SUMMARIZE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to generate summary',
      details: process.env.NODE_ENV !== 'production' ? String(error) : undefined,
    };
    return NextResponse.json(errorBody, { status: 500 });
  }
}
