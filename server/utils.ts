/**
 * Server-side utility functions
 * - Timeout handling
 * - Fallback mechanisms
 * - Retry logic with exponential backoff
 */

/**
 * Wraps an async function with a timeout
 * @param fetchFn Async function that returns a Promise
 * @param ms Timeout in milliseconds
 * @param label Label for logging
 * @returns Promise that rejects with timeout error if exceeded
 */
export async function withTimeout<T>(
  fetchFn: () => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    fetchFn(),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${ms}ms: ${label}`));
      }, ms);
    }),
  ]);
}

/**
 * Retry a function with exponential backoff
 * Useful for handling transient errors like 403 rate limits
 * 
 * @param fn Async function to retry
 * @param options Retry configuration
 * @returns Result from successful execution
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableStatusCodes?: number[];
    label?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryableStatusCodes = [403, 429, 500, 502, 503, 504],
    label = 'Retry',
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        console.log(`[${label}] ✅ Succeeded on attempt ${attempt + 1}/${maxRetries + 1}`);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const isRetryable = 
        (error instanceof Error && 
         ('status' in error || 'statusCode' in error || error.message.includes('403') || error.message.includes('429'))) ||
        retryableStatusCodes.some(code => 
          error instanceof Error && error.message.includes(String(code))
        );

      // Don't retry on last attempt or if error is not retryable
      if (attempt >= maxRetries || !isRetryable) {
        if (attempt >= maxRetries) {
          console.error(`[${label}] ❌ All ${maxRetries + 1} attempts failed`);
        } else {
          console.error(`[${label}] ❌ Non-retryable error: ${lastError.message}`);
        }
        throw lastError;
      }

      console.warn(
        `[${label}] ⚠️ Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
      );

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Tries primary function first, then fallback if primary fails
 * - No infinite retries
 * - No concurrent retry storms (sequential execution)
 * - Returns first successful result (primary or fallback)
 * - If both fail, throws the last error
 * 
 * @param primaryFn Primary async function
 * @param fallbackFn Fallback async function (only called if primary fails)
 * @param label Label for logging
 * @returns Result from primary (if successful) or fallback (if primary fails)
 */
export async function tryPrimaryThenFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  label: string
): Promise<T> {
  try {
    const result = await primaryFn();
    console.log(`[${label}] Primary source succeeded`);
    return result;
  } catch (primaryError) {
    console.warn(`[${label}] Primary source failed:`, primaryError instanceof Error ? primaryError.message : primaryError);
    console.log(`[${label}] Attempting fallback...`);
    
    try {
      const fallbackResult = await fallbackFn();
      console.log(`[${label}] Fallback source succeeded`);
      return fallbackResult;
    } catch (fallbackError) {
      console.error(`[${label}] Both primary and fallback failed`);
      // Throw the last error (fallback error is more recent)
      throw fallbackError;
    }
  }
}
