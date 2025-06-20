import { NextRequest, NextResponse } from 'next/server';
import { processTextToSentences } from '@/utils/nlp';

export async function POST(req: NextRequest) {
  // First check if the request body is empty
  const contentLength = req.headers.get('content-length');
  if (!contentLength || parseInt(contentLength) === 0) {
    return NextResponse.json(
      { error: 'Request body is empty' },
      { status: 400 }
    );
  }

  // Check content type
  const contentType = req.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 400 }
    );
  }

  try {
    // Get the raw body text first to validate it's not empty
    const rawBody = await req.text();
    if (!rawBody?.trim()) {
      return NextResponse.json(
        { error: 'Request body is empty' },
        { status: 400 }
      );
    }

    // Try to parse the JSON
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error('JSON parse error:', e);
      return NextResponse.json(
        { error: 'Invalid JSON format' },
        { status: 400 }
      );
    }

    // Validate the parsed body has the required text field
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body format' },
        { status: 400 }
      );
    }

    const { text } = body;
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid text field' },
        { status: 400 }
      );
    }

    // Use the shared utility function for consistent processing
    const sentences = processTextToSentences(text);
    return NextResponse.json({ sentences });
  } catch (error) {
    console.error('Error processing text:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
