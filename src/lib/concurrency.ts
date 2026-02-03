/**
 * Utility for processing items with a concurrency limit
 *
 * This enables parallel processing of items (like TTS generation) while
 * respecting rate limits and preventing resource exhaustion.
 */

export type ConcurrencyResult<R> =
  | { status: 'fulfilled'; value: R }
  | { status: 'rejected'; reason: Error };

/**
 * Process items in parallel with a maximum concurrency limit.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param maxConcurrent - Maximum number of concurrent processors (must be >= 1)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of results in the same order as input items
 */
export async function processWithConcurrencyLimit<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrent: number,
  signal?: AbortSignal
): Promise<ConcurrencyResult<R>[]> {
  // Validate maxConcurrent to prevent crashes
  if (maxConcurrent < 1 || !Number.isFinite(maxConcurrent)) {
    throw new Error(`maxConcurrent must be >= 1, got ${maxConcurrent}`);
  }

  const results: ConcurrencyResult<R>[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      if (signal?.aborted) break;

      const index = currentIndex++;
      if (index >= items.length) break;

      try {
        const result = await processor(items[index], index);
        results[index] = { status: 'fulfilled', value: result };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error as Error };
      }
    }
  }

  const workerCount = Math.min(maxConcurrent, items.length);
  await Promise.all(Array(workerCount).fill(null).map(() => worker()));

  // Fill any undefined slots (from aborted operations) with rejected results
  for (let i = 0; i < items.length; i++) {
    if (results[i] === undefined) {
      results[i] = { status: 'rejected', reason: new Error('Operation aborted') };
    }
  }

  return results;
}
