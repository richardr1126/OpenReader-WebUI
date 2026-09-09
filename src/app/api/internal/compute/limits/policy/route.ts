import { NextRequest, NextResponse } from 'next/server';
import type { ComputeLimitPolicyBrokerResponse } from '@openreader/runtime-config/compute-limit-broker';
import { authenticateCredentialBrokerRequest } from '@/lib/server/compute-worker/credential-broker-auth';
import { getRuntimeConfig } from '@/lib/server/admin/settings';
import { computePolicyVersion } from '@/lib/server/compute-limits/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = authenticateCredentialBrokerRequest(request.headers.get('authorization'));
  if (auth === 'unconfigured') return NextResponse.json({ error: 'BROKER_UNAVAILABLE' }, { status: 503 });
  if (auth !== 'authorized') return NextResponse.json({ error: 'BROKER_UNAUTHORIZED' }, { status: 401 });
  const policy = (await getRuntimeConfig()).computeLimitPolicies;
  const response: ComputeLimitPolicyBrokerResponse = {
    policy,
    policyVersion: computePolicyVersion(policy),
  };
  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' },
  });
}
