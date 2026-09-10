import { afterEach, describe, expect, test, vi } from 'vitest';
import { cloneComputeLimitPolicyDocument } from '@openreader/runtime-config/compute-limits';
import { ComputeExecutionScheduler } from '../../src/jobs/execution-scheduler';

describe('compute execution scheduler', () => {
  afterEach(() => vi.useRealTimers());

  test('applies a live global-cap increase without restarting', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    policy.actions.pdf_layout.execution!.maxConcurrentPerWorker = 2;
    const scheduler = new ComputeExecutionScheduler(() => policy);

    const first = await scheduler.acquire('pdf_layout');
    expect(first.status).toBe('acquired');
    const second = scheduler.acquire('pdf_layout');
    policy.worker.maxExecutingPerWorker = 2;
    policy.worker.resources.cpu_heavy = 2;
    policy.worker.resources.model_inference = 2;
    scheduler.policyChanged();

    const secondResult = await second;
    expect(secondResult.status).toBe('acquired');
    if (first.status === 'acquired') scheduler.release(first.lease);
    if (secondResult.status === 'acquired') scheduler.release(secondResult.lease);
  });

  test('serves interactive work before background work', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    policy.actions.tts_playback.execution!.maxConcurrentPerWorker = 1;
    policy.actions.document_preview.execution!.maxConcurrentPerWorker = 1;
    const scheduler = new ComputeExecutionScheduler(() => policy);
    const running = await scheduler.acquire('pdf_layout');

    const order: string[] = [];
    const background = scheduler.acquire('document_preview').then((value) => {
      if (value.status === 'acquired') order.push('background');
      return value;
    });
    const interactive = scheduler.acquire('tts_playback').then((value) => {
      if (value.status === 'acquired') order.push('interactive');
      return value;
    });
    if (running.status === 'acquired') scheduler.release(running.lease);

    const interactiveResult = await interactive;
    expect(interactiveResult.status).toBe('acquired');
    expect(order).toEqual(['interactive']);
    if (interactiveResult.status === 'acquired') scheduler.release(interactiveResult.lease);
    const backgroundResult = await background;
    expect(backgroundResult.status).toBe('acquired');
    expect(order).toEqual(['interactive', 'background']);
    if (backgroundResult.status === 'acquired') scheduler.release(backgroundResult.lease);
  });

  test('cancels queued acquisitions during shutdown', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    const scheduler = new ComputeExecutionScheduler(() => policy);
    const running = await scheduler.acquire('pdf_layout');
    const waiting = scheduler.acquire('tts_playback');

    scheduler.cancelWaiters();

    await expect(waiting).resolves.toEqual({ status: 'cancelled' });
    if (running.status === 'acquired') scheduler.release(running.lease);
  });

  test('distinguishes queue expiration from rejection and shutdown cancellation', async () => {
    vi.useFakeTimers();
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    policy.actions.tts_playback.execution!.maxQueueAgeSeconds = 1;
    const scheduler = new ComputeExecutionScheduler(() => policy);
    const running = await scheduler.acquire('pdf_layout');
    const waiting = scheduler.acquire('tts_playback');

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(waiting).resolves.toEqual({ status: 'expired' });
    if (running.status === 'acquired') scheduler.release(running.lease);
  });

  test('releases the exact resource snapshot when same-action jobs finish out of order', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 3;
    policy.worker.resources.cpu_heavy = 3;
    policy.actions.pdf_layout.execution!.maxConcurrentPerWorker = 3;
    policy.actions.pdf_layout.execution!.resources = { cpu_heavy: 1 };
    const scheduler = new ComputeExecutionScheduler(() => policy);

    const first = await scheduler.acquire('pdf_layout');
    policy.actions.pdf_layout.execution!.resources = { cpu_heavy: 2 };
    const second = await scheduler.acquire('pdf_layout');
    expect(first.status).toBe('acquired');
    expect(second.status).toBe('acquired');
    if (second.status === 'acquired') scheduler.release(second.lease);

    const third = await scheduler.acquire('pdf_layout');
    expect(third.status).toBe('acquired');
    if (first.status === 'acquired') scheduler.release(first.lease);
    if (third.status === 'acquired') scheduler.release(third.lease);
  });

  test('distinguishes an expired queue wait from rejection and shutdown cancellation', async () => {
    vi.useFakeTimers();
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    policy.actions.tts_playback.execution!.maxQueueAgeSeconds = 1;
    const scheduler = new ComputeExecutionScheduler(() => policy);
    const running = await scheduler.acquire('pdf_layout');
    const waiting = scheduler.acquire('tts_playback');

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(waiting).resolves.toEqual({ status: 'expired' });
    if (running.status === 'acquired') scheduler.release(running.lease);
  });
});
