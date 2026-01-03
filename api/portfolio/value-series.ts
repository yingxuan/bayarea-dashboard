/**
 * Vercel Serverless Function: /api/portfolio/value-series
 * Returns portfolio value time series for sparkline visualization
 * 
 * Requirements:
 * - Always return >= 20 data points
 * - Store portfolio value every 5 minutes to local JSON file
 * - Fallback to seed (flat line) if no historical data
 * - Return ModulePayload<{t:string, v:number}>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
} from '../utils.js';
import { ModulePayload } from '../../shared/types.js';
import { ttlMsToSeconds } from '../../shared/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data file path (local JSON storage)
// For Vercel: use /tmp directory (writable)
// For local: use data directory
const isVercel = process.env.VERCEL === '1';
const DATA_FILE = isVercel
  ? path.join('/tmp', 'portfolio-value-series.json')
  : path.join(__dirname, '../../data/portfolio-value-series.json');

// Cache TTL: 5 minutes (same as data collection interval)
const VALUE_SERIES_CACHE_TTL = 5 * 60 * 1000;

interface ValueDataPoint {
  t: string; // ISO 8601 timestamp
  v: number; // Portfolio value
}

interface StoredSeries {
  points: ValueDataPoint[];
  lastUpdated: string; // ISO 8601 timestamp
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(DATA_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * Load stored series from JSON file
 */
async function loadStoredSeries(): Promise<StoredSeries | null> {
  try {
    await ensureDataDir();
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(content) as StoredSeries;
    return data;
  } catch (error) {
    // File doesn't exist or invalid - return null
    return null;
  }
}

/**
 * Save series to JSON file
 */
async function saveStoredSeries(series: StoredSeries): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(series, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Portfolio Value Series] Failed to save series:', error);
  }
}

/**
 * Calculate current portfolio value from holdings and quotes
 * Reuses the quotes API logic
 */
async function calculatePortfolioValue(holdings: Array<{ ticker: string; shares: number }>): Promise<number> {
  if (holdings.length === 0) {
    return 0;
  }

  try {
    // Use internal quotes API logic (simplified - fetch from Finnhub directly)
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
    
    if (!FINNHUB_API_KEY) {
      console.warn('[Portfolio Value Series] FINNHUB_API_KEY not configured');
      return 0;
    }

    // Fetch quotes in parallel
    const quotePromises = holdings.map(async (holding) => {
      const ticker = holding.ticker.toUpperCase();
      const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'BayAreaDashboard/1.0',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const price = data.c || 0; // Current price (c field from Finnhub)
        
        if (price <= 0) {
          return { ticker, price: 0, shares: holding.shares };
        }
        
        return { ticker, price, shares: holding.shares };
      } catch (error) {
        console.warn(`[Portfolio Value Series] Failed to fetch quote for ${ticker}:`, error);
        return { ticker, price: 0, shares: holding.shares };
      }
    });

    const quotes = await Promise.all(quotePromises);
    
    // Calculate total value
    let totalValue = 0;
    quotes.forEach(({ price, shares }) => {
      if (price > 0 && shares > 0) {
        totalValue += price * shares;
      }
    });

    return totalValue;
  } catch (error) {
    console.error('[Portfolio Value Series] Failed to calculate portfolio value:', error);
    return 0;
  }
}

/**
 * Append current value to stored series (if 5 minutes have passed)
 */
async function appendCurrentValue(holdings: Array<{ ticker: string; shares: number }>): Promise<void> {
  try {
    const stored = await loadStoredSeries();
    const now = new Date();
    const nowISO = now.toISOString();

    // Check if we need to append (last update was > 5 minutes ago)
    if (stored && stored.lastUpdated) {
      const lastUpdated = new Date(stored.lastUpdated);
      const minutesSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
      
      if (minutesSinceUpdate < 5) {
        // Too soon, don't append
        return;
      }
    }

    // Calculate current value
    const currentValue = await calculatePortfolioValue(holdings);
    
    if (currentValue <= 0) {
      // Skip if no valid value
      return;
    }

    const newPoint: ValueDataPoint = {
      t: nowISO,
      v: currentValue,
    };

    // Load existing points
    const existingPoints = stored?.points || [];
    
    // Filter to keep only today's points (for 1D range)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPoints = existingPoints.filter(p => {
      const pointDate = new Date(p.t);
      return pointDate >= today;
    });

    // Append new point
    const updatedPoints = [...todayPoints, newPoint];

    // Keep only last 24 hours (288 points at 5min intervals, but we'll keep more for safety)
    const maxPoints = 300;
    const finalPoints = updatedPoints.slice(-maxPoints);

    // Save updated series
    await saveStoredSeries({
      points: finalPoints,
      lastUpdated: nowISO,
    });

    console.log(`[Portfolio Value Series] Appended value ${currentValue} at ${nowISO}`);
  } catch (error) {
    console.error('[Portfolio Value Series] Failed to append current value:', error);
  }
}

/**
 * Generate seed data (flat line using current value)
 */
function generateSeedData(currentValue: number, count: number = 20): ValueDataPoint[] {
  const now = new Date();
  const points: ValueDataPoint[] = [];
  
  // Generate points for the last 24 hours (5-minute intervals)
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 5 * 60 * 1000);
    points.push({
      t: timestamp.toISOString(),
      v: currentValue,
    });
  }
  
  return points;
}

/**
 * Interpolate or pad points to ensure >= 20 points
 */
function ensureMinPoints(points: ValueDataPoint[], minCount: number = 20): ValueDataPoint[] {
  if (points.length >= minCount) {
    return points;
  }

  if (points.length === 0) {
    // No points at all - generate seed
    return generateSeedData(0, minCount);
  }

  // Pad by repeating last point
  const lastPoint = points[points.length - 1];
  const padded: ValueDataPoint[] = [...points];
  
  while (padded.length < minCount) {
    const newTimestamp = new Date(new Date(lastPoint.t).getTime() + (padded.length - points.length) * 5 * 60 * 1000);
    padded.push({
      t: newTimestamp.toISOString(),
      v: lastPoint.v,
    });
  }

  return padded;
}

/**
 * Filter points for 1D range (last 24 hours)
 */
function filter1DRange(points: ValueDataPoint[]): ValueDataPoint[] {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return points.filter(p => {
    const pointTime = new Date(p.t);
    return pointTime >= oneDayAgo;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'portfolio-value-series';
    const range = (req.query.range as string) || '1d';
    const interval = (req.query.interval as string) || '5m';

    // Only support 1d range and 5m interval for now
    if (range !== '1d' || interval !== '5m') {
      return res.status(400).json({
        error: 'Only range=1d and interval=5m are supported',
      });
    }

    // Parse holdings from query parameter (JSON encoded)
    let holdings: Array<{ ticker: string; shares: number }> = [];
    try {
      if (req.query.holdings) {
        const holdingsParam = decodeURIComponent(req.query.holdings as string);
        holdings = JSON.parse(holdingsParam);
      }
    } catch (error) {
      console.warn('[Portfolio Value Series] Failed to parse holdings:', error);
    }

    // Check cache
    const cached = getCachedData(cacheKey, VALUE_SERIES_CACHE_TTL, nocache);
    if (cached) {
      const payload = cached.data as ModulePayload<ValueDataPoint>;
      return res.status(200).json({
        ...payload,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
      });
    }

    // Try to append current value (async, don't wait)
    if (holdings.length > 0) {
      appendCurrentValue(holdings).catch(err => {
        console.error('[Portfolio Value Series] Background append failed:', err);
      });
    }

    // Load stored series
    const stored = await loadStoredSeries();
    let points: ValueDataPoint[] = [];
    let source: "live" | "cache" | "seed" = "live";
    let status: "ok" | "degraded" | "failed" = "ok";
    let note: string | undefined;

    if (stored && stored.points.length > 0) {
      // Filter for 1D range
      points = filter1DRange(stored.points);
      
      if (points.length === 0) {
        // No points in range - use seed
        const currentValue = holdings.length > 0 ? await calculatePortfolioValue(holdings) : 0;
        points = generateSeedData(currentValue);
        source = "seed";
        status = "degraded";
        note = "no intraday points yet";
      } else {
        source = "live";
        status = "ok";
      }
    } else {
      // No stored data - generate seed
      const currentValue = holdings.length > 0 ? await calculatePortfolioValue(holdings) : 0;
      points = generateSeedData(currentValue);
      source = "seed";
      status = "degraded";
      note = "no intraday points yet";
    }

    // Ensure minimum 20 points
    points = ensureMinPoints(points, 20);

    const fetchedAt = new Date().toISOString();
    const payload: ModulePayload<ValueDataPoint> = {
      source,
      status,
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(VALUE_SERIES_CACHE_TTL),
      note,
      items: points,
    };

    // Cache the response
    setCache(cacheKey, payload);

    return res.status(200).json({
      ...payload,
      cache_hit: false,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlMsToSeconds(VALUE_SERIES_CACHE_TTL),
    });
  } catch (error) {
    console.error('[Portfolio Value Series] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'portfolio-value-series';
    const stale = getStaleCache(cacheKey);
    if (stale) {
      const payload = stale.data as ModulePayload<ValueDataPoint>;
      return res.status(200).json({
        ...payload,
        cache_hit: true,
        cache_mode: 'stale',
        cache_age_seconds: Math.floor((Date.now() - stale.timestamp) / 1000),
        cache_expires_in_seconds: 0,
      });
    }

    // Last resort: return seed data
    const seedPoints = generateSeedData(0, 20);
    const payload: ModulePayload<ValueDataPoint> = {
      source: "seed",
      status: "failed",
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 60,
      note: "all sources failed, using seed",
      items: seedPoints,
    };

    return res.status(200).json({
      ...payload,
      cache_hit: false,
      cache_mode: 'error',
      cache_age_seconds: 0,
      cache_expires_in_seconds: 60,
    });
  }
}
