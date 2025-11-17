import type { TTSRetryOptions } from '@/types/tts';

/**
 * Executes a function with exponential backoff retry logic
 * @param operation Function to retry
 * @param options Retry configuration options
 * @returns Promise resolving to the operation result
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: TTSRetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Do not retry on explicit cancellation/abort errors - surface them
      // immediately so callers can stop work quickly when the user cancels.
      if (lastError.name === 'AbortError' || lastError.message.includes('cancelled')) {
        break;
      }

      if (attempt === maxRetries - 1) {
        break;
      }

      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Operation failed after retries');
};