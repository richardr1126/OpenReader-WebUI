import type {
  ComputeLimitPolicyDocument,
  WorkerOperationAction,
  WorkerResource,
} from '@openreader/runtime-config/compute-limits';

const PRIORITY_WEIGHT = { interactive: 0, foreground: 1, background: 2 } as const;

type Waiter = {
  action: WorkerOperationAction;
  queuedAt: number;
  resolve: (result: ComputeExecutionAcquireResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type ComputeExecutionLease = {
  action: WorkerOperationAction;
  resources: Partial<Record<WorkerResource, number>>;
  released: boolean;
};

export type ComputeExecutionAcquireResult =
  | { status: 'acquired'; lease: ComputeExecutionLease }
  | { status: 'rejected' | 'expired' | 'cancelled' };

export class ComputeExecutionScheduler {
  private activeTotal = 0;
  private readonly activeByAction = new Map<WorkerOperationAction, number>();
  private readonly activeResources = new Map<WorkerResource, number>();
  private readonly waiters: Waiter[] = [];

  constructor(private readonly getPolicy: () => ComputeLimitPolicyDocument) {}

  private canAcquire(
    action: WorkerOperationAction,
    resources: Partial<Record<WorkerResource, number>>,
  ): boolean {
    const policy = this.getPolicy();
    const execution = policy.actions[action].execution!;
    if (this.activeTotal >= policy.worker.maxExecutingPerWorker) return false;
    if ((this.activeByAction.get(action) ?? 0) >= execution.maxConcurrentPerWorker) return false;
    return Object.entries(resources).every(([resource, units]) => (
      (this.activeResources.get(resource as WorkerResource) ?? 0) + Number(units)
        <= policy.worker.resources[resource as WorkerResource]
    ));
  }

  private claim(
    action: WorkerOperationAction,
    resources: Partial<Record<WorkerResource, number>>,
  ): ComputeExecutionLease {
    this.activeTotal += 1;
    this.activeByAction.set(action, (this.activeByAction.get(action) ?? 0) + 1);
    for (const [resource, units] of Object.entries(resources)) {
      const key = resource as WorkerResource;
      this.activeResources.set(key, (this.activeResources.get(key) ?? 0) + Number(units));
    }
    return { action, resources, released: false };
  }

  async acquire(action: WorkerOperationAction): Promise<ComputeExecutionAcquireResult> {
    const resources = { ...this.getPolicy().actions[action].execution!.resources };
    if (this.canAcquire(action, resources)) {
      return { status: 'acquired', lease: this.claim(action, resources) };
    }
    const execution = this.getPolicy().actions[action].execution!;
    if (this.waiters.filter((waiter) => waiter.action === action).length >= execution.maxQueued) {
      return { status: 'rejected' };
    }
    return new Promise<ComputeExecutionAcquireResult>((resolve) => {
      const waiter: Waiter = {
        action,
        queuedAt: Date.now(),
        resolve,
        timeout: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          resolve({ status: 'expired' });
        }, execution.maxQueueAgeSeconds * 1000),
      };
      this.waiters.push(waiter);
      this.drain();
    });
  }

  release(lease: ComputeExecutionLease): void {
    if (lease.released) return;
    lease.released = true;
    const { action, resources } = lease;
    this.activeTotal = Math.max(0, this.activeTotal - 1);
    this.activeByAction.set(action, Math.max(0, (this.activeByAction.get(action) ?? 0) - 1));
    for (const [resource, units] of Object.entries(resources)) {
      const key = resource as WorkerResource;
      this.activeResources.set(key, Math.max(0, (this.activeResources.get(key) ?? 0) - Number(units)));
    }
    this.drain();
  }

  policyChanged(): void {
    this.drain();
  }

  cancelWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve({ status: 'cancelled' });
    }
  }

  private drain(): void {
    const policy = this.getPolicy();
    this.waiters.sort((left, right) => {
      const priority = PRIORITY_WEIGHT[policy.actions[left.action].execution!.priority]
        - PRIORITY_WEIGHT[policy.actions[right.action].execution!.priority];
      return priority || left.queuedAt - right.queuedAt;
    });
    let index = 0;
    while (index < this.waiters.length) {
      const waiter = this.waiters[index];
      const resources = { ...policy.actions[waiter.action].execution!.resources };
      if (!this.canAcquire(waiter.action, resources)) {
        index += 1;
        continue;
      }
      this.waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve({ status: 'acquired', lease: this.claim(waiter.action, resources) });
    }
  }
}
