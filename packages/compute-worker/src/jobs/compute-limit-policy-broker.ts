import {
  parseComputeLimitPolicyDocument,
  type ComputeLimitPolicyDocument,
} from '@openreader/runtime-config/compute-limits';
import { getTtsCredentialBrokerConfig } from '../infrastructure/credential-broker-config';

export async function fetchComputeLimitPolicy(signal?: AbortSignal): Promise<ComputeLimitPolicyDocument> {
  const config = getTtsCredentialBrokerConfig();
  const url = new URL(config.url);
  url.pathname = '/api/internal/compute/limits/policy';
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timeout = setTimeout(() => controller.abort(new Error('compute policy broker timeout')), config.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as { policy?: unknown } | null;
    const policy = parseComputeLimitPolicyDocument(body?.policy);
    if (!response.ok || !policy) throw new Error(`Compute policy broker request failed (${response.status})`);
    return policy;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
