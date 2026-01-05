/**
 * Places API Configuration
 * Controls whether Places API calls are allowed
 */

// HARD RULE: Production uses seeds-only mode (no Places API calls)
// Manual refresh is the only exception (via debug UI)
export const USE_PLACES_API = import.meta.env.PROD ? false : false; // Always false - seeds-only mode

// Allow manual refresh in dev/debug mode
export const ALLOW_MANUAL_REFRESH = import.meta.env.DEV || 
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1');

// New Places (新店打卡) specific config
export const NEW_PLACES_TTL_DAYS = 14;
export const NEW_PLACES_COOLDOWN_DAYS = 7;
export const NEW_PLACES_MAX_API_CALLS_PER_REFRESH = 1; // Strict: exactly 1 call
