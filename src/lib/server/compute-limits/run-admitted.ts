import type { ComputeOperation } from '@/lib/server/compute-worker/protocol';
import type {
  ComputeLimitPolicyDocument,
  WorkerOperationAction,
} from '@openreader/runtime-config/compute-limits';
import type { ComputeLimitSubject } from './policy';
import {
  activateComputeAdmission,
  finishComputeAdmission,
  reserveComputeAdmission,
} from './admission';

export class ComputeAdmissionLimitedError extends Error {
  readonly code = 'COMPUTE_ADMISSION_RATE_LIMITED';
  readonly httpStatus = 429;
  readonly retryable = true;
  readonly details: { retryAfterMs: number };

  constructor(readonly retryAfterMs: number) {
    super('Compute work is temporarily limited. Please try again shortly.');
    this.name = 'ComputeAdmissionLimitedError';
    this.details = { retryAfterMs };
  }
}

async function linkOperationWithRetry(input: {
  admissionId: string;
  operationId: string;
  leaseSeconds: number;
}): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await activateComputeAdmission(input);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function createAdmittedComputeOperation<T extends ComputeOperation>(input: {
  policy: ComputeLimitPolicyDocument;
  action: WorkerOperationAction;
  requestKey: string;
  subject: ComputeLimitSubject;
  create: () => Promise<T>;
}): Promise<T> {
  const decision = await reserveComputeAdmission(input);
  if (!decision.allowed || !decision.admissionId) {
    throw new ComputeAdmissionLimitedError(decision.retryAfterMs);
  }
  const leaseSeconds = Math.max(
    60,
    ...input.policy.actions[input.action].admission.active.map((limit) => limit.leaseSeconds),
  );
  let operation: T | null = null;
  try {
    await activateComputeAdmission({ admissionId: decision.admissionId, leaseSeconds });
    operation = await input.create();
    await linkOperationWithRetry({
      admissionId: decision.admissionId,
      operationId: operation.opId,
      leaseSeconds,
    });
    if (operation.status === 'failed') {
      await finishComputeAdmission({ admissionId: decision.admissionId, state: 'cancelled' });
    } else if (operation.status === 'succeeded') {
      await finishComputeAdmission({ admissionId: decision.admissionId, state: 'finished' });
    }
    return operation;
  } catch (error) {
    if (!operation) {
      await finishComputeAdmission({ admissionId: decision.admissionId, state: 'cancelled' })
        .catch(() => undefined);
    }
    throw error;
  }
}
