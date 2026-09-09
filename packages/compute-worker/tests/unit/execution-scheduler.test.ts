import { describe, expect, test } from 'vitest';
import { cloneComputeLimitPolicyDocument } from '@openreader/runtime-config/compute-limits';
import { ComputeExecutionScheduler } from '../../src/jobs/execution-scheduler';

describe('compute execution scheduler', () => {
  test('applies a live global-cap increase without restarting', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    policy.actions.pdf_layout.execution!.maxConcurrentPerWorker = 2;
    const scheduler = new ComputeExecutionScheduler(() => policy);

    await expect(scheduler.acquire('pdf_layout')).resolves.toBe(true);
    const second = scheduler.acquire('pdf_layout');
    policy.worker.maxExecutingPerWorker = 2;
    policy.worker.resources.cpu_heavy = 2;
    policy.worker.resources.model_inference = 2;
    scheduler.policyChanged();

    await expect(second).resolves.toBe(true);
    scheduler.release('pdf_layout');
    scheduler.release('pdf_layout');
  });

  test('serves interactive work before background work', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    policy.actions.tts_playback.execution!.maxConcurrentPerWorker = 1;
    policy.actions.document_preview.execution!.maxConcurrentPerWorker = 1;
    const scheduler = new ComputeExecutionScheduler(() => policy);
    await scheduler.acquire('pdf_layout');

    const order: string[] = [];
    const background = scheduler.acquire('document_preview').then((value) => {
      if (value) order.push('background');
      return value;
    });
    const interactive = scheduler.acquire('tts_playback').then((value) => {
      if (value) order.push('interactive');
      return value;
    });
    scheduler.release('pdf_layout');

    await expect(interactive).resolves.toBe(true);
    expect(order).toEqual(['interactive']);
    scheduler.release('tts_playback');
    await expect(background).resolves.toBe(true);
    expect(order).toEqual(['interactive', 'background']);
    scheduler.release('document_preview');
  });

  test('cancels queued acquisitions during shutdown', async () => {
    const policy = cloneComputeLimitPolicyDocument();
    policy.worker.maxExecutingPerWorker = 1;
    const scheduler = new ComputeExecutionScheduler(() => policy);
    await scheduler.acquire('pdf_layout');
    const waiting = scheduler.acquire('tts_playback');

    scheduler.cancelWaiters();

    await expect(waiting).resolves.toBe(false);
    scheduler.release('pdf_layout');
  });
});
