import { NextResponse } from 'next/server';
import { auth } from '@/lib/server/auth';
import { rateLimiter, RATE_LIMITS } from '@/lib/server/rate-limiter';
import { headers } from 'next/headers';
import { isAuthEnabled } from '@/lib/server/auth-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // If auth is not enabled, return unlimited status
    if (!isAuthEnabled() || !auth) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return NextResponse.json({
        allowed: true,
        currentCount: 0,
        limit: Infinity,
        remainingChars: Infinity,
        resetTime: tomorrow.toISOString(),
        userType: 'unauthenticated',
        authEnabled: false
      });
    }

    // Get session from auth
    const session = await auth.api.getSession({
      headers: await headers()
    });

    // No session means unauthenticated
    if (!session?.user) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return NextResponse.json({
        allowed: true,
        currentCount: 0,
        limit: RATE_LIMITS.ANONYMOUS,
        remainingChars: RATE_LIMITS.ANONYMOUS,
        resetTime: tomorrow.toISOString(),
        userType: 'unauthenticated',
        authEnabled: true
      });
    }

    const isAnonymous = !session.user.email || session.user.email === '';

    const result = await rateLimiter.getCurrentUsage({
      id: session.user.id,
      isAnonymous
    });

    return NextResponse.json({
      allowed: result.allowed,
      currentCount: result.currentCount,
      limit: result.limit,
      remainingChars: result.remainingChars,
      resetTime: result.resetTime.toISOString(),
      userType: isAnonymous ? 'anonymous' : 'authenticated',
      authEnabled: true
    });
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return NextResponse.json(
      { error: 'Failed to get rate limit status' },
      { status: 500 }
    );
  }
}
