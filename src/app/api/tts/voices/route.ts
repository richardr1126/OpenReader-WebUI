import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];

export async function GET(req: NextRequest) {
  try {
    // Get API credentials from headers or fall back to environment variables
    const openApiKey = req.headers.get('x-openai-key') || process.env.API_KEY || 'none';
    const openApiBaseUrl = req.headers.get('x-openai-base-url') || process.env.API_BASE;

    // Request voices from OpenAI
    const response = await fetch(`${openApiBaseUrl}/audio/voices`, {
      headers: {
        'Authorization': `Bearer ${openApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    return NextResponse.json({ voices: data.voices || DEFAULT_VOICES, failed: false });
  } catch (error) {
    console.error('Error fetching voices:', error);
    // Return default voices on error with failed flag
    return NextResponse.json({ voices: DEFAULT_VOICES, failed: true });
  }
}