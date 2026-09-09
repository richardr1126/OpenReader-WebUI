import type {
  ComputeLimitPolicyDocument,
  WorkerOperationAction,
  WorkerResource,
} from '@openreader/runtime-config/compute-limits';

const PRIORITY_WEIGHT = { interactive: 0, foreground: 1, background: 2 } as const;

type Waiter = {
  action: WorkerOperationAction;
  queuedAt: number;
  resolve: (acquired: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class ComputeExecutionScheduler {
  private activeTotal = 0;
  private readonly activeByAction = new Map<WorkerOperationAction, number>();
  private readonly activeResources = new Map<WorkerResource, number>();
  private readonly allocations = new Map<WorkerOperationAction, Array<Partial<Record<WorkerResource, number>>>>();
  private readonly waiters: Waiter[] = [];

  constructor(private readonly getPolicy: () => ComputeLimitPolicyDocument) {}

  private canAcquire(action: WorkerOperationAction): boolean {
    const policy = this.getPolicy();
    const execution = policy.actions[action].execution!;
    if (this.activeTotal >= policy.worker.maxExecutingPerWorker) return false;
    if ((this.activeByAction.get(action) ?? 0) >= execution.maxConcurrentPerWorker) return false;
    return Object.entries(execution.resources).every(([resource, units]) => (
      (this.activeResources.get(resource as WorkerResource) ?? 0) + Number(units)
        <= policy.worker.resources[resource as WorkerResource]
    ));
  }

  private claim(action: WorkerOperationAction): void {
    const execution = this.getPolicy().actions[action].execution!;
    this.activeTotal += 1;
    this.activeByAction.set(action, (this.activeByAction.get(action) ?? 0) + 1);
    for (const [resource, units] of Object.entries(execution.resources)) {
      const key = resource as WorkerResource;
      this.activeResources.set(key, (this.activeResources.get(key) ?? 0) + Number(units));
    }
    const allocations = this.allocations.get(action) ?? [];
    allocations.push({ ...execution.resources });
    this.allocations.set(action, allocations);
  }

  async acquire(action: WorkerOperationAction): Promise<boolean> {
    if (this.canAcquire(action)) {
      this.claim(action);
      return true;
    }
    const execution = this.getPolicy().actions[action].execution!;
    if (this.waiters.filter((waiter) => waiter.action === action).length >= execution.maxQueued) return false;
    return new Promise<boolean>((resolve) => {
      const waiter: Waiter = {
        action,
        queuedAt: Date.now(),
        resolve,
        timeout: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          resolve(false);
        }, execution.maxQueueAgeSeconds * 1000),
      };
      this.waiters.push(waiter);
      this.drain();
    });
  }

  release(action: WorkerOperationAction): void {
    const resources = this.allocations.get(action)?.shift() ?? {};
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
      waiter.resolve(false);
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
      if (!this.canAcquire(waiter.action)) {
        index += 1;
        continue;
      }
      this.waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      this.claim(waiter.action);
      waiter.resolve(true);
    }
  }
}
