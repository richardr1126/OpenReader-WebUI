import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/';

  if (token !== getAuthToken()) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url));
  response.cookies.set('auth_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return response;
}
