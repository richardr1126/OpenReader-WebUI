import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const VOICES = ['troy', 'austin', 'daniel', 'autumn', 'diana', 'hannah'];

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await req.json();

    // Validate input text
    if (!body.input || typeof body.input !== 'string' || !body.input.trim()) {
      return NextResponse.json(
        { error: 'Missing or empty input text' },
        { status: 400 }
      );
    }

    // Set default model if not provided or not a canopylabs model
    let model = body.model || '';
    if (!model.startsWith('canopylabs/')) {
      model = 'canopylabs/orpheus-v1-english';
    }

    // Validate voice
    const voice = VOICES.includes(body.voice) ? body.voice : 'troy';

    // Groq requires response_format
    const responseFormat = body.response_format || 'wav';

    const groqBody = {
      model,
      voice,
      input: body.input,
      response_format: responseFormat,
    };

    // Create abort controller with 30-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${GROQ_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', errorText);
      // Return sanitized error message to avoid exposing internal details
      const sanitizedError = response.status === 401 ? 'Invalid API key' :
                            response.status === 429 ? 'Rate limit exceeded' :
                            response.status >= 500 ? 'Groq service error' :
                            'Failed to generate speech';
      return NextResponse.json(
        { error: sanitizedError },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const contentType = responseFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav';

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Groq TTS error:', error);
    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}
