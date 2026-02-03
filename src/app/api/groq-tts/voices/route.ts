import { NextResponse } from 'next/server';

const VOICES = ['troy', 'austin', 'daniel', 'autumn', 'diana', 'hannah'];

export async function GET() {
  return NextResponse.json({ voices: VOICES });
}
