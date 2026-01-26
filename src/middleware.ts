import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Auth disabled by default - set AUTH_ENABLED=true to enable
  if (process.env.AUTH_ENABLED !== 'true') {
    return NextResponse.next();
  }

  const { pathname, searchParams } = request.nextUrl;

  // Skip static files and auth endpoint
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth') || pathname.match(/\.(ico|png|svg|jpg|jpeg|gif|webp|json)$/)) {
    return NextResponse.next();
  }

  // Token in URL -> redirect to auth API
  const token = searchParams.get('token');
  if (token) {
    const authUrl = new URL('/api/auth', request.url);
    authUrl.searchParams.set('token', token);
    authUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(authUrl);
  }

  // Valid cookie -> allow
  if (request.cookies.get('auth_session')?.value) {
    return NextResponse.next();
  }

  // Unauthorized
  return new NextResponse('Unauthorized - add ?token=YOUR_TOKEN to URL (check server logs)', {
    status: 401,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
