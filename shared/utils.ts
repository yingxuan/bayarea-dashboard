/**
 * Shared Utility Functions
 * Common helpers for processing API responses and data extraction
 */

/**
 * Extract source information from API response (supports both new and legacy formats)
 */
export function getSourceInfo<T extends { source?: { name: string; url: string }; source_name?: string; source_url?: string }>(
  item: T
): { name: string; url: string } {
  return {
    name: item.source?.name || item.source_name || 'Unknown',
    url: item.source?.url || item.source_url || '#',
  };
}

/**
 * Extract status from API response (supports both new and legacy formats)
 */
export function getStatus<T extends { status?: 'ok' | 'stale' | 'unavailable'; value?: any }>(
  item: T
): 'ok' | 'stale' | 'unavailable' {
  if (item.status) return item.status;
  
  // Fallback: if value is "Unavailable" or invalid, treat as unavailable
  if (item.value === 'Unavailable' || (typeof item.value === 'string' && item.value.toLowerCase() === 'unavailable')) {
    return 'unavailable';
  }
  
  // If value is a valid number, treat as ok
  if (typeof item.value === 'number' && item.value > 0) {
    return 'ok';
  }
  
  return 'unavailable';
}

/**
 * Extract asOf timestamp from API response (supports both new and legacy formats)
 */
export function getAsOf<T extends { asOf?: string; as_of?: string; fetched_at?: string }>(
  item: T
): string {
  return item.asOf || item.as_of || item.fetched_at || new Date().toISOString();
}

/**
 * Extract numeric value safely from API response
 */
export function getNumericValue<T extends { value?: number | string }>(
  item: T
): number {
  if (typeof item.value === 'number') return item.value;
  if (typeof item.value === 'string' && item.value !== 'Unavailable') {
    const parsed = parseFloat(item.value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Check if data is available (status === "ok")
 */
export function isDataAvailable<T extends { status?: 'ok' | 'stale' | 'unavailable' }>(
  item: T
): boolean {
  return getStatus(item) === 'ok';
}

/**
 * Check if data is stale (status === "stale")
 */
export function isDataStale<T extends { status?: 'ok' | 'stale' | 'unavailable' }>(
  item: T
): boolean {
  return getStatus(item) === 'stale';
}

/**
 * Check if data is unavailable (status === "unavailable")
 */
export function isDataUnavailable<T extends { status?: 'ok' | 'stale' | 'unavailable' }>(
  item: T
): boolean {
  return getStatus(item) === 'unavailable';
}

/**
 * Calculate TTL seconds from milliseconds
 */
export function ttlMsToSeconds(ttlMs: number): number {
  return Math.floor(ttlMs / 1000);
}

/**
 * Calculate TTL milliseconds from seconds
 */
export function ttlSecondsToMs(ttlSeconds: number): number {
  return ttlSeconds * 1000;
}
