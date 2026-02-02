import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken } from '@/lib/auth';

function isValidReturnTo(returnTo: string): boolean {
  // Only allow relative paths starting with /
  // Reject absolute URLs, protocol-relative URLs, and other schemes
  if (!returnTo.startsWith('/')) return false;
  if (returnTo.startsWith('//')) return false;
  // Reject URLs with encoded characters that could bypass checks
  if (returnTo.includes('%')) {
    try {
      const decoded = decodeURIComponent(returnTo);
      if (decoded.startsWith('//') || decoded.includes('://')) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/';

  if (token !== getAuthToken()) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Validate returnTo to prevent open redirect attacks
  const safeReturnTo = isValidReturnTo(returnTo) ? returnTo : '/';
  const response = NextResponse.redirect(new URL(safeReturnTo, request.url));
  response.cookies.set('auth_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return response;
}
