/**
 * Server-side utility functions
 * - Timeout handling
 * - Fallback mechanisms
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
