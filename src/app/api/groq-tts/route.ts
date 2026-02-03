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

    const response = await fetch(`${GROQ_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText },
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate speech' },
      { status: 500 }
    );
  }
}
