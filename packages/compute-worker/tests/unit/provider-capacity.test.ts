import { describe, expect, test } from 'vitest';
import { cloneComputeLimitPolicyDocument } from '@openreader/runtime-config/compute-limits';
import { ProviderCapacityCoordinator } from '../../src/jobs/provider-capacity';
import type { KvEntryLike, KvStoreLike } from '../../src/infrastructure/nats-adapters';

class MemoryKv implements KvStoreLike {
  private readonly values = new Map<string, KvEntryLike>();
  private revision = 0;

  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, data: Uint8Array) {
    this.values.set(key, { operation: 'PUT', value: data, revision: ++this.revision });
  }
  async create(key: string, data: Uint8Array) {
    if (this.values.has(key)) throw new Error('key exists');
    await this.put(key, data);
  }
  async update(key: string, data: Uint8Array, version: number) {
    if (this.values.get(key)?.revision !== version) throw new Error('wrong last sequence');
    await this.put(key, data);
  }
  async keys() { return (async function* () {})(); }
}

describe('provider capacity coordinator', () => {
  test('serializes enforced provider calls and releases the slot', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.providers.defaults = {
      mode: 'enforce',
      maxConcurrent: 1,
      requestsPerMinute: 100,
      charactersPerMinute: 100_000,
      maxWaitSeconds: 1,
    };
    const coordinator = new ProviderCapacityCoordinator(() => policy);
    const releaseFirst = await coordinator.acquire({ providerRef: 'shared', characters: 100 });
    let secondAcquired = false;
    const second = coordinator.acquire({ providerRef: 'shared', characters: 100 }).then((release) => {
      secondAcquired = true;
      return release;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(secondAcquired).toBe(false);
    releaseFirst();
    const releaseSecond = await second;
    expect(secondAcquired).toBe(true);
    releaseSecond();
  });

  test('uses a named provider override', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.providers.defaults.mode = 'off';
    policy.providers.overrides.premium = {
      mode: 'enforce',
      maxConcurrent: 1,
      requestsPerMinute: 1,
      charactersPerMinute: 10,
      maxWaitSeconds: 1,
    };
    const coordinator = new ProviderCapacityCoordinator(() => policy);
    const release = await coordinator.acquire({ providerRef: 'premium', characters: 10 });
    release();
    const controller = new AbortController();
    const waiting = coordinator.acquire({
      providerRef: 'premium',
      characters: 1,
      signal: controller.signal,
    });
    controller.abort(new Error('cancelled'));
    await expect(waiting).rejects.toThrow('cancelled');
  });

  test('shares enforced concurrency across worker instances through JetStream KV', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.providers.defaults = {
      mode: 'enforce', maxConcurrent: 1, requestsPerMinute: 100,
      charactersPerMinute: 100_000, maxWaitSeconds: 1,
    };
    const kv = new MemoryKv();
    const firstWorker = new ProviderCapacityCoordinator(() => policy, async () => kv);
    const secondWorker = new ProviderCapacityCoordinator(() => policy, async () => kv);
    const releaseFirst = await firstWorker.acquire({ providerRef: 'shared', characters: 100 });
    const controller = new AbortController();
    const blocked = secondWorker.acquire({
      providerRef: 'shared', characters: 100, signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort(new Error('blocked across workers'));
    await expect(blocked).rejects.toThrow('blocked across workers');
    releaseFirst();
    const releaseSecond = await secondWorker.acquire({ providerRef: 'shared', characters: 100 });
    releaseSecond();
  });

  test('records observed distributed demand without blocking it', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.providers.defaults = {
      mode: 'observe', maxConcurrent: 1, requestsPerMinute: 1,
      charactersPerMinute: 100, maxWaitSeconds: 1,
    };
    const kv = new MemoryKv();
    const coordinator = new ProviderCapacityCoordinator(() => policy, async () => kv);
    const releaseFirst = await coordinator.acquire({ providerRef: 'shared', characters: 100 });
    const releaseSecond = await coordinator.acquire({ providerRef: 'shared', characters: 100 });
    releaseFirst();
    releaseSecond();

    policy.providers.defaults.mode = 'enforce';
    const controller = new AbortController();
    const blocked = coordinator.acquire({
      providerRef: 'shared', characters: 1, signal: controller.signal,
    });
    controller.abort(new Error('observed demand retained'));
    await expect(blocked).rejects.toThrow('observed demand retained');
  });
});
