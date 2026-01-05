/**
 * Vercel Serverless Function: /api/quotes
 * Generic stock quotes API using Finnhub
 * Supports batch queries for multiple tickers
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  cache,
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  formatUpdatedAt,
} from '../../api/utils.js';
import { ttlMsToSeconds } from '../../shared/config.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1/quote';
const QUOTE_CACHE_TTL_MS = 60 * 1000; // 60 seconds default (can be 30-120s)
const FETCH_TIMEOUT_MS = 5000; // 5 seconds timeout per request
const MAX_CONCURRENT_REQUESTS = 5; // Limit concurrent requests to avoid rate limits

/**
 * Standard quote response structure
 */
interface QuoteData {
  ticker: string;
  status: 'ok' | 'stale' | 'unavailable';
  price: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  asOf: string;
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string;
}

/**
 * Finnhub API response structure
 */
interface FinnhubQuoteResponse {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Timestamp
}

/**
 * Simple concurrency limiter (no external dependencies)
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  async limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) next();
          }
        }
      };

      if (this.running < MAX_CONCURRENT_REQUESTS) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }
}

const limiter = new ConcurrencyLimiter();

/**
 * Fetch quote for a single ticker from Finnhub
 */
async function fetchQuoteFromFinnhub(ticker: string): Promise<QuoteData> {
  const now = new Date().toISOString();
  
  if (!FINNHUB_API_KEY) {
    return {
      ticker,
      status: 'unavailable',
      price: 0,
      asOf: now,
      source: {
        name: 'Finnhub',
        url: 'https://finnhub.io',
      },
      ttlSeconds: 60,
      error: 'Missing FINNHUB_API_KEY',
    };
  }

  const url = `${FINNHUB_BASE_URL}?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BayAreaDashboard/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle rate limiting (429)
    if (response.status === 429) {
      console.warn(`[Quotes] Rate limited for ${ticker}, marking as unavailable`);
      return {
        ticker,
        status: 'unavailable',
        price: 0,
        asOf: now,
        source: {
          name: 'Finnhub',
          url: `https://finnhub.io/quote/${ticker}`,
        },
        ttlSeconds: 60,
        error: 'Rate limited (429)',
      };
    }

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    const data: FinnhubQuoteResponse = await response.json();

    // Check if data is valid (Finnhub returns {c: 0, ...} for invalid symbols)
    if (!data.c || data.c === 0) {
      return {
        ticker,
        status: 'unavailable',
        price: 0,
        asOf: now,
        source: {
          name: 'Finnhub',
          url: `https://finnhub.io/quote/${ticker}`,
        },
        ttlSeconds: 60,
        error: 'Invalid ticker or no data available',
      };
    }

    const price = data.c;
    const prevClose = data.pc;
    const change = data.d;
    const changePercent = data.dp;

    return {
      ticker,
      status: 'ok',
      price,
      prevClose,
      change,
      changePercent,
      asOf: now,
      source: {
        name: 'Finnhub',
        url: `https://finnhub.io/quote/${ticker}`,
      },
      ttlSeconds: Math.floor(QUOTE_CACHE_TTL_MS / 1000),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Quotes] Failed to fetch quote for ${ticker}:`, errorMsg);
    
    return {
      ticker,
      status: 'unavailable',
      price: 0,
      asOf: now,
      source: {
        name: 'Finnhub',
        url: `https://finnhub.io/quote/${ticker}`,
      },
      ttlSeconds: 60,
      error: errorMsg,
    };
  }
}

/**
 * Fetch quote for a single ticker (with cache and concurrency limit)
 */
async function fetchQuote(ticker: string, nocache: boolean): Promise<QuoteData> {
  const cacheKey = `quote_${ticker.toUpperCase()}`;
  
  // Check cache
  if (!nocache) {
    const cached = getCachedData(cacheKey, QUOTE_CACHE_TTL_MS, false);
    if (cached) {
      const quoteData = cached.data as QuoteData;
      // Mark as stale if cache is old but still valid
      if (cached.cacheAgeSeconds > 30) {
        return {
          ...quoteData,
          status: 'stale',
        };
      }
      return quoteData;
    }
  }

  // Fetch with concurrency limit
  const quoteData = await limiter.limit(() => fetchQuoteFromFinnhub(ticker));
  
  // Cache successful results
  if (quoteData.status === 'ok') {
    setCache(cacheKey, quoteData);
  }
  
  return quoteData;
}

export async function handleQuotes(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    
    // Parse tickers from query parameter
    const tickersParam = req.query.tickers;
    if (!tickersParam || typeof tickersParam !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid tickers parameter',
        message: 'Please provide tickers as comma-separated list: ?tickers=AAPL,MSFT,NVDA',
      });
    }

    // Parse and normalize tickers
    const tickers = tickersParam
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    if (tickers.length === 0) {
      return res.status(400).json({
        error: 'No valid tickers provided',
      });
    }

    // Limit batch size to avoid overwhelming the API
    if (tickers.length > 20) {
      return res.status(400).json({
        error: 'Too many tickers',
        message: 'Maximum 20 tickers per request',
      });
    }

    console.log(`[Quotes] Fetching quotes for ${tickers.length} tickers:`, tickers);

    // Fetch quotes for all tickers (with concurrency limit)
    const quotes = await Promise.all(
      tickers.map(ticker => fetchQuote(ticker, nocache))
    );

    const fetchedAt = new Date();
    const response = {
      quotes,
      updated_at: formatUpdatedAt(),
      fetched_at: fetchedAt.toISOString(),
      tickers_requested: tickers,
      tickers_count: tickers.length,
      cache_mode: nocache ? 'bypass' : 'normal',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('[Quotes] Error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to fetch quotes',
      message: errorMsg,
    });
  }
}

export default handleQuotes;
