/**
 * Portfolio Value Series Handler
 * Returns portfolio value time series for sparkline visualization
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  cache,
} from '../../lib/api-utils.js';
import { ModulePayload } from '../../shared/types.js';
import { ttlMsToSeconds } from '../../shared/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const DATA_FILE = isVercel
  ? path.join('/tmp', 'portfolio-value-series.json')
  : path.join(__dirname, '../../data/portfolio-value-series.json');

const VALUE_SERIES_CACHE_TTL = 5 * 60 * 1000;

interface ValueDataPoint {
  t: string;
  v: number;
}

interface StoredSeries {
  points: ValueDataPoint[];
  lastUpdated: string;
}

async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(DATA_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function loadStoredSeries(): Promise<StoredSeries | null> {
  try {
    await ensureDataDir();
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content) as StoredSeries;
  } catch {
    return null;
  }
}

async function saveStoredSeries(series: StoredSeries): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(series, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Portfolio Value Series] Failed to save series:', error);
  }
}

async function calculatePortfolioValue(holdings: Array<{ ticker: string; shares: number }>): Promise<number> {
  if (holdings.length === 0) return 0;

  try {
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
    if (!FINNHUB_API_KEY) {
      console.warn('[Portfolio Value Series] FINNHUB_API_KEY not configured');
      return 0;
    }

    const quotePromises = holdings.map(async (holding) => {
      const ticker = holding.ticker.toUpperCase();
      const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'BayAreaDashboard/1.0' } });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const price = data.c || 0;
        return { ticker, price, shares: holding.shares };
      } catch (error) {
        console.warn(`[Portfolio Value Series] Failed to fetch quote for ${ticker}:`, error);
        return { ticker, price: 0, shares: holding.shares };
      }
    });

    const quotes = await Promise.all(quotePromises);
    return quotes.reduce((total, { price, shares }) => (price > 0 && shares > 0 ? total + price * shares : total), 0);
  } catch (error) {
    console.error('[Portfolio Value Series] Failed to calculate portfolio value:', error);
    return 0;
  }
}

async function appendCurrentValue(holdings: Array<{ ticker: string; shares: number }>): Promise<void> {
  try {
    const stored = await loadStoredSeries();
    const now = new Date();
    const nowISO = now.toISOString();

    if (stored?.lastUpdated) {
      const minutesSinceUpdate = (now.getTime() - new Date(stored.lastUpdated).getTime()) / (1000 * 60);
      if (minutesSinceUpdate < 5) return;
    }

    const currentValue = await calculatePortfolioValue(holdings);
    if (currentValue <= 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPoints = (stored?.points || []).filter(p => new Date(p.t) >= today);
    const updatedPoints = [...todayPoints, { t: nowISO, v: currentValue }].slice(-300);

    await saveStoredSeries({ points: updatedPoints, lastUpdated: nowISO });
    console.log(`[Portfolio Value Series] Appended value ${currentValue} at ${nowISO}`);
  } catch (error) {
    console.error('[Portfolio Value Series] Failed to append current value:', error);
  }
}

function ensureMinPoints(points: ValueDataPoint[], minCount: number = 20): ValueDataPoint[] {
  if (points.length >= minCount) return points;
  if (points.length === 0) return [];

  const lastPoint = points[points.length - 1];
  const padded: ValueDataPoint[] = [...points];
  while (padded.length < minCount) {
    padded.push({
      t: new Date(new Date(lastPoint.t).getTime() + (padded.length - points.length) * 5 * 60 * 1000).toISOString(),
      v: lastPoint.v,
    });
  }
  return padded;
}

function filter1DRange(points: ValueDataPoint[]): ValueDataPoint[] {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return points.filter(p => new Date(p.t) >= oneDayAgo);
}

export async function handleValueSeries(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'portfolio-value-series';
    const range = (req.query.range as string) || '1d';
    const interval = (req.query.interval as string) || '5m';

    if (range !== '1d' || interval !== '5m') {
      res.status(400).json({ error: 'Only range=1d and interval=5m are supported' });
      return;
    }

    let holdings: Array<{ ticker: string; shares: number }> = [];
    try {
      if (req.query.holdings) {
        holdings = JSON.parse(decodeURIComponent(req.query.holdings as string));
      }
    } catch {
      console.warn('[Portfolio Value Series] Failed to parse holdings');
    }

    const cached = getCachedData(cacheKey, VALUE_SERIES_CACHE_TTL, nocache);
    if (cached) {
      res.status(200).json({ ...cached.data, cache_hit: true, cache_mode: 'normal', cache_age_seconds: cached.cacheAgeSeconds, cache_expires_in_seconds: cached.cacheExpiresInSeconds });
      return;
    }

    if (holdings.length > 0) {
      appendCurrentValue(holdings).catch(err => console.error('[Portfolio Value Series] Background append failed:', err));
    }

    const stored = await loadStoredSeries();
    let points: ValueDataPoint[] = [];
    let source: "live" | "cache" | "seed" | "unavailable" = "live";
    let status: "ok" | "degraded" | "failed" = "ok";
    let note: string | undefined;

    if (stored && stored.points.length > 0) {
      points = filter1DRange(stored.points);
      if (points.length === 0) {
        source = "unavailable";
        status = "failed";
        note = "no intraday points available";
      }
    } else {
      source = "unavailable";
      status = "failed";
      note = "no intraday points available";
    }

    points = ensureMinPoints(points, 20);

    const payload: ModulePayload<ValueDataPoint> = {
      source,
      status,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: ttlMsToSeconds(VALUE_SERIES_CACHE_TTL),
      note,
      items: points,
    };

    setCache(cacheKey, payload);
    res.status(200).json({ ...payload, cache_hit: false, cache_mode: nocache ? 'bypass' : 'normal', cache_age_seconds: 0, cache_expires_in_seconds: ttlMsToSeconds(VALUE_SERIES_CACHE_TTL) });
  } catch (error) {
    console.error('[Portfolio Value Series] Error:', error);

    const cacheKey = 'portfolio-value-series';
    const stale = getStaleCache(cacheKey);
    if (stale) {
      const cached = cache.get(cacheKey);
      res.status(200).json({ ...stale.data, cache_hit: true, cache_mode: 'stale', cache_age_seconds: cached ? Math.floor((Date.now() - cached.timestamp) / 1000) : 0, cache_expires_in_seconds: 0 });
      return;
    }

    res.status(200).json({
      source: "unavailable", status: "failed", fetchedAt: new Date().toISOString(),
      ttlSeconds: 60, note: "all sources failed, no fallback data available", items: [],
      cache_hit: false, cache_mode: 'error', cache_age_seconds: 0, cache_expires_in_seconds: 60,
    });
  }
}
