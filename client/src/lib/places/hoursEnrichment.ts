/**
 * Opening Hours Enrichment Cache
 * Fetches and caches opening hours for places (used for 夜宵 filtering)
 * 
 * Rules:
 * - Only enriches items for 夜宵 category
 * - Max 3 calls per session
 * - TTL: 30 days
 * - Homepage does NOT call API automatically
 */

import { get, set } from 'idb-keyval';
import { config } from '@/config';

const HOURS_TTL_DAYS = 30;
const HOURS_DB_PREFIX = 'place_hours:';
const MAX_HOURS_CALLS = 3;
const COOLDOWN_KEY = 'place_hours_cooldown_until';

// Session state
let callsMadeThisSession = 0;

export interface OpeningHours {
  placeId: string;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
  currentOpeningHours?: {
    openNow?: boolean;
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
  updatedAt: number;
}

/**
 * Get cached opening hours
 */
export async function getCachedHours(placeId: string): Promise<OpeningHours | null> {
  try {
    const key = `${HOURS_DB_PREFIX}${placeId}`;
    const cached = await get<OpeningHours>(key);
    if (!cached) return null;
    
    // Check if fresh
    const ageMs = Date.now() - cached.updatedAt;
    const ttlMs = HOURS_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > ttlMs) {
      // Expired, but return it anyway (stale data better than nothing)
      return cached;
    }
    
    return cached;
  } catch (error) {
    console.error('[HoursEnrichment] Error getting cached hours:', error);
    return null;
  }
}

/**
 * Set cached opening hours
 */
export async function setCachedHours(hours: OpeningHours): Promise<void> {
  try {
    const key = `${HOURS_DB_PREFIX}${hours.placeId}`;
    await set(key, hours);
  } catch (error) {
    console.error('[HoursEnrichment] Error setting cached hours:', error);
  }
}

/**
 * Check if in cooldown
 */
async function isInCooldown(): Promise<boolean> {
  try {
    const cooldownUntil = await get<number>(COOLDOWN_KEY);
    if (!cooldownUntil) return false;
    return Date.now() < cooldownUntil;
  } catch (error) {
    return false;
  }
}

/**
 * Set cooldown
 */
async function setCooldown(days: number = 7): Promise<void> {
  try {
    const cooldownUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    await set(COOLDOWN_KEY, cooldownUntil);
  } catch (error) {
    console.error('[HoursEnrichment] Error setting cooldown:', error);
  }
}

/**
 * Fetch opening hours from Places API
 */
export async function fetchOpeningHours(placeId: string): Promise<OpeningHours | null> {
  if (callsMadeThisSession >= MAX_HOURS_CALLS) {
    console.warn(`[HoursEnrichment] Max calls reached (${MAX_HOURS_CALLS}), skipping`);
    return null;
  }

  if (await isInCooldown()) {
    console.warn('[HoursEnrichment] In cooldown, skipping');
    return null;
  }

  try {
    callsMadeThisSession++;

    const url = `${config.apiBaseUrl}/api/spend/enrich-hours?placeId=${encodeURIComponent(placeId)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 403) {
        await setCooldown(7);
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.placeId) {
      return null;
    }

    const hours: OpeningHours = {
      placeId: data.placeId,
      regularOpeningHours: data.regularOpeningHours,
      currentOpeningHours: data.currentOpeningHours,
      updatedAt: Date.now(),
    };

    // Cache it
    await setCachedHours(hours);

    return hours;
  } catch (error: any) {
    console.error('[HoursEnrichment] Error fetching hours:', error);
    if (error.message === 'QUOTA_EXCEEDED') {
      await setCooldown(7);
    }
    return null;
  }
}

/**
 * Check if place is open late (closes >= 22:00 or 24h)
 */
export function isLateNightPlace(hours: OpeningHours | null): boolean {
  if (!hours) return false;

  const regular = hours.regularOpeningHours;
  const current = hours.currentOpeningHours;

  // Check if open 24 hours
  if (regular?.weekdayDescriptions) {
    const is24h = regular.weekdayDescriptions.some(desc => 
      desc.toLowerCase().includes('24 hours') || 
      desc.toLowerCase().includes('open 24')
    );
    if (is24h) return true;
  }

  // Check periods for closing time >= 22:00 (10pm)
  // We need to check ALL periods to ensure at least one day closes late
  const periods = regular?.periods || current?.periods || [];
  
  if (periods.length === 0) return false;
  
  // Check if ANY period closes at 22:00 (10pm) or later
  // Note: closeHour is 0-23, where 0 = midnight (00:00), 22 = 10pm, 23 = 11pm
  // We want: closes at 22:00 (10pm) or later (22, 23) OR at 0:00 (midnight)
  // Exclude: closes at 21:00 (9pm) or earlier (0-21, but not 0 which is midnight)
  let hasLateNightPeriod = false;
  
  for (const period of periods) {
    if (period.close) {
      const closeHour = period.close.hour;
      const closeMinute = period.close.minute || 0;
      
      // Convert to minutes for easier comparison
      const closeTimeMinutes = closeHour * 60 + closeMinute;
      
      // 22:00 = 1320 minutes, we want >= 1320 OR exactly 0:00 (midnight = 0 minutes)
      // But note: if closeHour === 0, it could be midnight (00:00) which is late night
      // OR it could be the next day (e.g., closes at 00:30 = next day 12:30am)
      if (closeHour === 0) {
        // Midnight (00:00) or early morning (00:01-00:59) = late night
        hasLateNightPeriod = true;
      } else if (closeTimeMinutes >= 1320) {
        // 22:00 (10pm) or later
        hasLateNightPeriod = true;
      }
    }
  }
  
  return hasLateNightPeriod;
}

/**
 * Get closing time for a place (for debug display)
 */
export function getClosingTime(hours: OpeningHours | null): string | null {
  if (!hours) return null;

  const periods = hours.regularOpeningHours?.periods || hours.currentOpeningHours?.periods || [];
  
  if (periods.length === 0) return null;

  // Get most common closing time (for weekdays)
  const closingTimes = periods
    .filter(p => p.close)
    .map(p => {
      const hour = p.close!.hour;
      const minute = p.close!.minute;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    });

  if (closingTimes.length === 0) return null;

  // Return most common closing time
  const counts = new Map<string, number>();
  closingTimes.forEach(time => {
    counts.set(time, (counts.get(time) || 0) + 1);
  });

  let maxCount = 0;
  let mostCommon = closingTimes[0];
  counts.forEach((count, time) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = time;
    }
  });

  return mostCommon;
}
