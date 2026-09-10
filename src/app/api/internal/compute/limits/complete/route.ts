import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@openreader/database';
import { computeLimitAdmissions } from '@openreader/database/schema';
import { parseComputeAdmissionTerminalRequest } from '@openreader/runtime-config/compute-limit-broker';
import { authenticateCredentialBrokerRequest } from '@/lib/server/compute-worker/credential-broker-auth';
import { finishComputeAdmission } from '@/lib/server/compute-limits/admission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };

function error(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authenticateCredentialBrokerRequest(request.headers.get('authorization'));
  if (auth === 'unconfigured') return error(503, 'BROKER_UNAVAILABLE');
  if (auth !== 'authorized') return error(401, 'BROKER_UNAUTHORIZED');
  const parsed = parseComputeAdmissionTerminalRequest(await request.json().catch(() => null));
  if (!parsed) return error(400, 'REQUEST_INVALID');
  const rows = await db.select({ id: computeLimitAdmissions.id })
    .from(computeLimitAdmissions)
    .where(eq(computeLimitAdmissions.operationId, parsed.operationId))
    .limit(100);
  for (const row of rows) {
    await finishComputeAdmission({
      admissionId: row.id,
      state: parsed.state === 'succeeded' ? 'finished' : 'cancelled',
    });
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}
