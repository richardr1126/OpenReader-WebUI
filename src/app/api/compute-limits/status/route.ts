import { NextResponse, type NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/server/auth/auth';
import { getClientIp } from '@/lib/server/rate-limit/request-ip';
import { getOrCreateDeviceId, setDeviceIdCookie } from '@/lib/server/rate-limit/device-id';
import { getResolvedRuntimeConfig } from '@/lib/server/runtime-config';
import { applicableUsageLimits } from '@/lib/server/compute-limits/policy';
import { getComputeUsage } from '@/lib/server/compute-limits/usage';
import { nextUtcMidnightTimestampMs } from '@/lib/shared/timestamps';
import { errorResponse } from '@/lib/server/errors/next-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const runtimeConfig = await getResolvedRuntimeConfig();
    const policy = runtimeConfig.computeLimitPolicies;
    const mode = policy.actions.tts_synthesis.mode;
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      const nominal = applicableUsageLimits(policy, 'tts_synthesis', {
        userId: 'unavailable',
        isAnonymous: true,
      }).find((limit) => limit.scope === 'user');
      const limit = mode === 'off' ? null : nominal?.limit ?? null;
      return NextResponse.json({
        allowed: true,
        currentCount: 0,
        limit,
        remainingChars: limit,
        resetTimeMs: nextUtcMidnightTimestampMs(),
        userType: 'unauthenticated',
        mode,
      });
    }

    const isAnonymous = Boolean((session.user as { isAnonymous?: boolean }).isAnonymous);
    const device = mode === 'off' || !isAnonymous ? null : getOrCreateDeviceId(req);
    const decision = await getComputeUsage({
      policy,
      action: 'tts_synthesis',
      metric: 'characters',
      subject: {
        userId: session.user.id,
        isAnonymous,
        deviceId: device?.deviceId ?? null,
        ip: getClientIp(req),
      },
    });
    const binding = decision.buckets.reduce<(typeof decision.buckets)[number] | null>(
      (current, bucket) => !current || bucket.remaining < current.remaining ? bucket : current,
      null,
    );
    const response = NextResponse.json({
      allowed: decision.allowed,
      currentCount: binding?.used ?? 0,
      limit: binding?.limit ?? null,
      remainingChars: binding?.remaining ?? null,
      resetTimeMs: binding?.resetAt ?? nextUtcMidnightTimestampMs(),
      userType: isAnonymous ? 'anonymous' : 'authenticated',
      mode,
    });
    if (device?.didCreate) setDeviceIdCookie(response, device.deviceId);
    return response;
  } catch (error) {
    return errorResponse(error, {
      apiErrorMessage: 'Failed to get compute limit status',
      normalize: { code: 'COMPUTE_LIMIT_STATUS_GET_FAILED', errorClass: 'db' },
    });
  }
}
