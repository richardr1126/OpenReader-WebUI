import { NextResponse } from 'next/server';
import { auth } from '@/lib/server/auth';
import { rateLimiter, RATE_LIMITS } from '@/lib/server/rate-limiter';
import { headers } from 'next/headers';
import { isAuthEnabled } from '@/lib/server/auth-config';

export const dynamic = 'force-dynamic';

function getUtcResetTimeIso(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(now.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

export async function GET() {
  try {
    // If auth is not enabled, return unlimited status
    if (!isAuthEnabled() || !auth) {
      const resetTime = getUtcResetTimeIso();
      return NextResponse.json({
        allowed: true,
        currentCount: 0,
        // Avoid Infinity in JSON (serializes to null). This value is never shown
        // because authEnabled=false, but we keep it finite to prevent surprises.
        limit: Number.MAX_SAFE_INTEGER,
        remainingChars: Number.MAX_SAFE_INTEGER,
        resetTime,
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
      const resetTime = getUtcResetTimeIso();
      return NextResponse.json({
        allowed: true,
        currentCount: 0,
        limit: RATE_LIMITS.ANONYMOUS,
        remainingChars: RATE_LIMITS.ANONYMOUS,
        resetTime,
        userType: 'unauthenticated',
        authEnabled: true
      });
    }

    const isAnonymous = Boolean(session.user.isAnonymous);

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
