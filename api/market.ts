/**
 * Vercel Serverless Function: /api/market
 * HYBRID APPROACH:
 * - Prices from stable APIs (CoinGecko, Stooq)
 * - Google CSE NOT used for price extraction
 * - source_url provides clickable reference
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withTimeout, tryPrimaryThenFallback } from '../server/utils.js';
import { CACHE_TTL, FETCH_TIMEOUT_MS, API_URLS, SOURCE_INFO, ttlMsToSeconds } from '../shared/config.js';
import {
  cache,
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  formatUpdatedAt,
} from './utils.js';

const MARKET_CACHE_TTL = CACHE_TTL.MARKET;

/**
 * Standard market data item structure
 * Follows: {status, value, asOf, source, ttlSeconds, error?}
 */
interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  prevClose?: number; // Previous close price for delta calculation
  prevDayValue?: number; // Alias for prevClose (alternative naming)
  unit: string;
  status: "ok" | "stale" | "unavailable";
  asOf: string; // ISO 8601 timestamp (renamed from as_of for consistency)
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string; // Only if status === "unavailable"
  // Legacy fields (for backward compatibility)
  source_name?: string; // Deprecated, use source.name
  source_url?: string; // Deprecated, use source.url
  as_of?: string; // Deprecated, use asOf
  // Debug fields (optional, for troubleshooting)
  debug?: {
    data_source: string;
    api_response?: any;
    error?: string;
  };
}

/**
 * Fetch Bitcoin price from CoinGecko API (with timeout)
 * Includes 24h price change for delta calculation
 */
async function fetchBTC(): Promise<MarketDataItem> {
  const now = new Date().toISOString();
  
  try {
    const fetchFn = async () => {
      // Fetch price with 24h change data
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const price = data?.bitcoin?.usd;
      const change24h = data?.bitcoin?.usd_24h_change;
      
      if (!price || typeof price !== 'number') {
        throw new Error('Invalid price data from CoinGecko');
      }
      
      // Calculate prevClose from 24h change if available
      let prevClose: number | undefined;
      let change: number | undefined;
      let change_percent: number | undefined;
      
      if (change24h !== undefined && typeof change24h === 'number') {
        // prevClose = price / (1 + change24h/100)
        prevClose = price / (1 + change24h / 100);
        change = price - prevClose;
        change_percent = change24h; // CoinGecko already provides percentage
      }
      
      console.log(`[fetchBTC] CoinGecko API returned: $${price}, 24h change: ${change_percent?.toFixed(2)}%`);
      
      return {
        name: 'BTC',
        value: price,
        change,
        change_percent,
        prevClose, // Add prevClose field
        unit: 'USD',
        status: 'ok' as const,
        asOf: now,
        source: {
          name: 'CoinGecko',
          url: 'https://www.coingecko.com/en/coins/bitcoin',
        },
        ttlSeconds: ttlMsToSeconds(MARKET_CACHE_TTL),
        // Legacy fields for backward compatibility
        source_name: 'CoinGecko',
        source_url: 'https://www.coingecko.com/en/coins/bitcoin',
        as_of: now,
        debug: {
          data_source: 'coingecko_api',
          api_response: { bitcoin: { usd: price, usd_24h_change: change24h } },
        },
      };
    };
    
    return await withTimeout(fetchFn, FETCH_TIMEOUT_MS, 'fetchBTC');
  } catch (error) {
    console.error('[fetchBTC] Error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'BTC',
      value: 'Unavailable',
      unit: 'USD',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'CoinGecko',
        url: 'https://www.coingecko.com/en/coins/bitcoin',
      },
      ttlSeconds: 600,
      error: errorMsg,
      // Legacy fields for backward compatibility
      source_name: 'CoinGecko',
      source_url: 'https://www.coingecko.com/en/coins/bitcoin',
      as_of: now,
      debug: {
        data_source: 'coingecko_api',
        error: errorMsg,
      },
    };
  }
}

/**
 * Fetch SPY price from Yahoo Finance API (primary) with Stooq fallback
 */
async function fetchSPY(): Promise<MarketDataItem> {
  const now = new Date().toISOString();
  
  // Primary: Yahoo Finance API (includes change data)
  const primaryFn = async (): Promise<MarketDataItem> => {
    // Yahoo Finance v8 API - no key required, but may be rate-limited
    // Risk: Rate limiting, but robust JSON parsing with error handling
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1d');
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Robust parsing with multiple fallback paths
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid response structure from Yahoo Finance');
    }
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose || meta?.chartPreviousClose;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error(`Invalid price from Yahoo Finance: ${price}`);
    }
    
    // Calculate change if available
    const previousClose = meta?.previousClose || meta?.chartPreviousClose;
    let change: number | undefined;
    let changePercent: number | undefined;
    
    if (previousClose && typeof previousClose === 'number' && previousClose > 0) {
      change = price - previousClose;
      changePercent = (change / previousClose) * 100;
    }
    
    console.log(`[fetchSPY] Yahoo Finance primary returned: $${price}, prevClose: ${previousClose}, change: ${changePercent?.toFixed(2)}%`);
    
    return {
      name: 'SPY',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: previousClose, // Add prevClose field
      prevDayValue: previousClose, // Alias for prevClose
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/quote/SPY/',
      },
      ttlSeconds: 600,
      // Legacy fields for backward compatibility
      source_name: 'Yahoo Finance',
      source_url: 'https://finance.yahoo.com/quote/SPY/',
      as_of: now,
      debug: {
        data_source: 'yahoo_finance_api',
        api_response: { price, previousClose, change, changePercent },
      },
    };
  };
  
  const fallbackFn = async (): Promise<MarketDataItem> => {
    const response = await fetch('https://stooq.com/q/l/?s=spy&f=sd2t2ohlcv&h&e=csv');
    
    if (!response.ok) {
      throw new Error(`Stooq API error: ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Invalid CSV data from Stooq');
    }
    
    const data = lines[1].split(',');
    const price = parseFloat(data[5]); // Close price
    const prevClose = parseFloat(data[3]); // Open price (approximation)
    
    if (isNaN(price) || price <= 0) {
      throw new Error('Invalid price data from Stooq');
    }
    
    const change = !isNaN(prevClose) ? price - prevClose : undefined;
    const changePercent = prevClose && change !== undefined ? (change / prevClose) * 100 : undefined;
    
    return {
      name: 'SPY',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: !isNaN(prevClose) ? prevClose : undefined,
      prevDayValue: !isNaN(prevClose) ? prevClose : undefined,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://stooq.com/q/?s=spy',
      },
      ttlSeconds: 600,
      source_name: 'Stooq',
      source_url: 'https://stooq.com/q/?s=spy',
      as_of: now,
      debug: {
        data_source: 'stooq_csv',
        api_response: { price, prevClose, change, changePercent },
      },
    };
  };
  
  try {
    return await tryPrimaryThenFallback(
      () => withTimeout(primaryFn, FETCH_TIMEOUT_MS, 'fetchSPY (Yahoo Finance)'),
      () => withTimeout(fallbackFn, FETCH_TIMEOUT_MS, 'fetchSPY (Stooq)'),
      'fetchSPY'
    );
  } catch (error) {
    console.error('[fetchSPY] Both primary and fallback failed:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'SPY',
      value: 'Unavailable',
      unit: 'USD',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'Stooq / Yahoo Finance',
        url: 'https://finance.yahoo.com/quote/SPY/',
      },
      ttlSeconds: 600,
      error: errorMsg,
      // Legacy fields for backward compatibility
      source_name: 'Stooq / Yahoo Finance',
      source_url: 'https://finance.yahoo.com/quote/SPY/',
      as_of: now,
      debug: {
        data_source: 'both_failed',
        error: errorMsg,
      },
    };
  }
}

/**
 * Fetch QQQ price from Yahoo Finance API (primary) with Stooq fallback
 */
async function fetchQQQ(): Promise<MarketDataItem> {
  const now = new Date().toISOString();
  
  const primaryFn = async () => {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/QQQ?interval=1d&range=1d');
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Robust parsing with multiple fallback paths (same as SPY)
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid response structure from Yahoo Finance');
    }
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose || meta?.chartPreviousClose;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error(`Invalid price from Yahoo Finance: ${price}`);
    }
    
    // Calculate change if available (same as SPY)
    const previousClose = meta?.previousClose || meta?.chartPreviousClose;
    let change: number | undefined;
    let changePercent: number | undefined;
    
    if (previousClose && typeof previousClose === 'number' && previousClose > 0) {
      change = price - previousClose;
      changePercent = (change / previousClose) * 100;
    }
    
    console.log(`[fetchQQQ] Yahoo Finance primary returned: $${price}, prevClose: ${previousClose}, change: ${changePercent?.toFixed(2)}%`);
    
    return {
      name: 'QQQ',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: previousClose as number | undefined,
      prevDayValue: previousClose as number | undefined,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/quote/QQQ/',
      },
      ttlSeconds: 600,
      source_name: 'Yahoo Finance',
      source_url: 'https://finance.yahoo.com/quote/QQQ/',
      as_of: now,
      debug: {
        data_source: 'yahoo_finance_api',
        api_response: { price, previousClose, change, changePercent },
      },
    };
  };
  
  const fallbackFn = async () => {
    const response = await fetch('https://stooq.com/q/l/?s=qqq&f=sd2t2ohlcv&h&e=csv');
    
    if (!response.ok) {
      throw new Error(`Stooq API error: ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Invalid CSV data from Stooq');
    }
    
    const data = lines[1].split(',');
    const price = parseFloat(data[5]); // Close price
    const prevClose = parseFloat(data[3]); // Open price (approximation)
    
    if (isNaN(price) || price <= 0) {
      throw new Error('Invalid price data from Stooq');
    }
    
    const change = !isNaN(prevClose) ? price - prevClose : undefined;
    const changePercent = prevClose && change !== undefined ? (change / prevClose) * 100 : undefined;
    
    return {
      name: 'QQQ',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: !isNaN(prevClose) ? prevClose : undefined,
      prevDayValue: !isNaN(prevClose) ? prevClose : undefined,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://stooq.com/q/?s=qqq',
      },
      ttlSeconds: 600,
      source_name: 'Stooq',
      source_url: 'https://stooq.com/q/?s=qqq',
      as_of: now,
    };
  };
  
  try {
    return await tryPrimaryThenFallback(
      () => withTimeout(primaryFn, FETCH_TIMEOUT_MS, 'fetchQQQ (Yahoo Finance)'),
      () => withTimeout(fallbackFn, FETCH_TIMEOUT_MS, 'fetchQQQ (Stooq)'),
      'fetchQQQ'
    );
  } catch (error) {
    console.error('[fetchQQQ] Both primary and fallback failed:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'QQQ',
      value: 'Unavailable',
      unit: 'USD',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'Stooq / Yahoo Finance',
        url: 'https://finance.yahoo.com/quote/QQQ/',
      },
      ttlSeconds: 600,
      error: errorMsg,
      source_name: 'Stooq / Yahoo Finance',
      source_url: 'https://finance.yahoo.com/quote/QQQ/',
      as_of: now,
      debug: {
        data_source: 'both_failed',
        error: errorMsg,
      },
    };
  }
}

/**
 * Fetch ARKK price from Yahoo Finance API (primary) with Stooq fallback
 */
async function fetchARKK(): Promise<MarketDataItem> {
  const now = new Date().toISOString();
  
  const primaryFn = async () => {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/ARKK?interval=1d&range=1d');
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Robust parsing with multiple fallback paths (same as SPY)
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid response structure from Yahoo Finance');
    }
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose || meta?.chartPreviousClose;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error(`Invalid price from Yahoo Finance: ${price}`);
    }
    
    // Calculate change if available (same as SPY)
    const previousClose = meta?.previousClose || meta?.chartPreviousClose;
    let change: number | undefined;
    let changePercent: number | undefined;
    
    if (previousClose && typeof previousClose === 'number' && previousClose > 0) {
      change = price - previousClose;
      changePercent = (change / previousClose) * 100;
    }
    
    console.log(`[fetchARKK] Yahoo Finance primary returned: $${price}, prevClose: ${previousClose}, change: ${changePercent?.toFixed(2)}%`);
    
    return {
      name: 'ARKK',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: previousClose as number | undefined,
      prevDayValue: previousClose as number | undefined,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/quote/ARKK/',
      },
      ttlSeconds: 600,
      source_name: 'Yahoo Finance',
      source_url: 'https://finance.yahoo.com/quote/ARKK/',
      as_of: now,
      debug: {
        data_source: 'yahoo_finance_api',
        api_response: { price, previousClose, change, changePercent },
      },
    };
  };
  
  const fallbackFn = async (): Promise<MarketDataItem> => {
    const response = await fetch('https://stooq.com/q/l/?s=arkk&f=sd2t2ohlcv&h&e=csv');
    
    if (!response.ok) {
      throw new Error(`Stooq API error: ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Invalid CSV data from Stooq');
    }
    
    const data = lines[1].split(',');
    const price = parseFloat(data[5]); // Close price
    const prevClose = parseFloat(data[3]); // Open price (approximation)
    
    if (isNaN(price) || price <= 0) {
      throw new Error('Invalid price data from Stooq');
    }
    
    const change = !isNaN(prevClose) ? price - prevClose : undefined;
    const changePercent = prevClose && change !== undefined ? (change / prevClose) * 100 : undefined;
    
    return {
      name: 'ARKK',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: !isNaN(prevClose) ? prevClose : undefined,
      prevDayValue: !isNaN(prevClose) ? prevClose : undefined,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://stooq.com/q/?s=arkk',
      },
      ttlSeconds: 600,
      source_name: 'Stooq',
      source_url: 'https://stooq.com/q/?s=arkk',
      as_of: now,
    };
  };
  
  try {
    return await tryPrimaryThenFallback(
      () => withTimeout(primaryFn, FETCH_TIMEOUT_MS, 'fetchARKK (Yahoo Finance)'),
      () => withTimeout(fallbackFn, FETCH_TIMEOUT_MS, 'fetchARKK (Stooq)'),
      'fetchARKK'
    );
  } catch (error) {
    console.error('[fetchARKK] Both primary and fallback failed:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'ARKK',
      value: 'Unavailable',
      unit: 'USD',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'Stooq / Yahoo Finance',
        url: 'https://finance.yahoo.com/quote/ARKK/',
      },
      ttlSeconds: 600,
      error: errorMsg,
      source_name: 'Stooq / Yahoo Finance',
      source_url: 'https://finance.yahoo.com/quote/ARKK/',
      as_of: now,
      debug: {
        data_source: 'both_failed',
        error: errorMsg,
      },
    };
  }
}

/**
 * Fetch Gold (XAUUSD) price from Yahoo Finance API (primary) with Stooq fallback
 */
async function fetchGold(): Promise<MarketDataItem> {
  const now = new Date().toISOString();
  
  // Primary: Yahoo Finance API (includes change data)
  const primaryFn = async (): Promise<MarketDataItem> => {
    // Yahoo Finance v8 API for gold futures (GC=F)
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d');
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Robust parsing with multiple fallback paths
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid response structure from Yahoo Finance');
    }
    
    const meta = result.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose || meta?.chartPreviousClose;
    
    if (!price || typeof price !== 'number' || price <= 0) {
      throw new Error(`Invalid price from Yahoo Finance: ${price}`);
    }
    
    // Calculate change if available
    const previousClose = meta?.previousClose || meta?.chartPreviousClose;
    let change: number | undefined;
    let changePercent: number | undefined;
    
    if (previousClose && typeof previousClose === 'number' && previousClose > 0) {
      change = price - previousClose;
      changePercent = (change / previousClose) * 100;
    }
    
    console.log(`[fetchGold] Yahoo Finance primary returned: $${price}, prevClose: ${previousClose}, change: ${changePercent?.toFixed(2)}%`);
    
    return {
      name: 'Gold',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: previousClose as number | undefined, // Add prevClose field
      prevDayValue: previousClose as number | undefined, // Alias for prevClose
      unit: 'USD/oz',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Yahoo Finance',
        url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      },
      ttlSeconds: 600,
      // Legacy fields for backward compatibility
      source_name: 'Yahoo Finance',
      source_url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      as_of: now,
      debug: {
        data_source: 'yahoo_finance_api',
        api_response: { price, previousClose, change, changePercent },
      },
    };
  };
  
  const fallbackFn = async (): Promise<MarketDataItem> => {
    const response = await fetch('https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv');
    
    if (!response.ok) {
      throw new Error(`Stooq API error: ${response.statusText}`);
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Invalid CSV data from Stooq');
    }
    
    const data = lines[1].split(',');
    const price = parseFloat(data[5]); // Close price
    const prevClose = parseFloat(data[3]); // Open price (approximation)
    
    if (isNaN(price) || price <= 0) {
      throw new Error('Invalid price data from Stooq');
    }
    
    const change = !isNaN(prevClose) ? price - prevClose : undefined;
    const changePercent = prevClose && change !== undefined ? (change / prevClose) * 100 : undefined;
    
    return {
      name: 'Gold',
      value: price,
      change,
      change_percent: changePercent,
      prevClose: !isNaN(prevClose) ? prevClose : undefined,
      prevDayValue: !isNaN(prevClose) ? prevClose : undefined,
      unit: 'USD/oz',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://stooq.com/q/?s=xauusd',
      },
      ttlSeconds: 600,
      source_name: 'Stooq',
      source_url: 'https://stooq.com/q/?s=xauusd',
      as_of: now,
      debug: {
        data_source: 'stooq_csv',
        api_response: { price, prevClose, change, changePercent },
      },
    };
  };
  
  try {
    return await tryPrimaryThenFallback(
      () => withTimeout(primaryFn, FETCH_TIMEOUT_MS, 'fetchGold (Yahoo Finance)'),
      () => withTimeout(fallbackFn, FETCH_TIMEOUT_MS, 'fetchGold (Stooq)'),
      'fetchGold'
    );
  } catch (error) {
    console.error('[fetchGold] Both primary and fallback failed:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'Gold',
      value: 'Unavailable',
      unit: 'USD/oz',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'Stooq / Yahoo Finance',
        url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      },
      ttlSeconds: 600,
      error: errorMsg,
      // Legacy fields for backward compatibility
      source_name: 'Stooq / Yahoo Finance',
      source_url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      as_of: now,
      debug: {
        data_source: 'both_failed',
        error: errorMsg,
      },
    };
  }
}

/**
 * Fetch mortgage rate
 * Note: No reliable API available, returning unavailable
 */
async function fetchMortgageRate(): Promise<MarketDataItem> {
  console.log('[fetchMortgageRate] No reliable API available, returning Unavailable');
  
  const now = new Date().toISOString();
  return {
    name: 'CA_JUMBO_ARM',
    value: 'Unavailable',
    unit: 'rate',
    status: 'unavailable' as const,
    asOf: now,
    source: {
      name: 'Bankrate',
      url: 'https://www.bankrate.com/mortgages/mortgage-rates/',
    },
    ttlSeconds: 0, // No caching for unavailable items
    error: 'No reliable API available for mortgage rates',
    // Legacy fields for backward compatibility
    source_name: 'Bankrate',
    source_url: 'https://www.bankrate.com/mortgages/mortgage-rates/',
    as_of: now,
    debug: {
      data_source: 'none',
      error: 'No reliable API available for mortgage rates',
    },
  };
}

/**
 * Fetch Powerball jackpot
 * Note: No scraping allowed, returning unavailable with correct source
 */
async function fetchPowerball(): Promise<MarketDataItem> {
  console.log('[fetchPowerball] No scraping allowed, returning Unavailable');
  
  const now = new Date().toISOString();
  return {
    name: 'POWERBALL',
    value: 'Unavailable',
    unit: 'USD',
    status: 'unavailable' as const,
    asOf: now,
    source: {
      name: 'Powerball.com',
      url: 'https://www.powerball.com/',
    },
    ttlSeconds: 0, // No caching for unavailable items
    error: 'Scraping not allowed, no reliable API available',
    // Legacy fields for backward compatibility
    source_name: 'Powerball.com',
    source_url: 'https://www.powerball.com/',
    as_of: now,
    debug: {
      data_source: 'none',
      error: 'Scraping not allowed, no reliable API available',
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }
  
  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'market_data';
    
    // Check cache
    const cached = getCachedData(cacheKey, MARKET_CACHE_TTL, nocache);
    if (cached) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
        cache_key: cacheKey,
      });
    }
    
    // Log cache bypass
    if (nocache) {
      console.log('[API /api/market] Cache bypass requested via ?nocache=1');
    }
    
    // Fetch fresh data from APIs
    const [spy, gold, btc, qqq, arkk, mortgage, powerball] = await Promise.all([
      fetchSPY(),
      fetchGold(),
      fetchBTC(),
      fetchQQQ(),
      fetchARKK(),
      fetchMortgageRate(),
      fetchPowerball(),
    ]);
    
    const fetchedAt = new Date();
    const response = {
      data: {
        spy,
        gold,
        btc,
        qqq,
        arkk,
        mortgage,
        powerball,
      },
      updated_at: formatUpdatedAt(),
      fetched_at: fetchedAt.toISOString(),
      cache_hit: false,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlMsToSeconds(MARKET_CACHE_TTL),
      cache_key: cacheKey,
      age: 0,
      expiry: ttlMsToSeconds(MARKET_CACHE_TTL),
    };
    
    // Update cache
    setCache(cacheKey, response);
    
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/market] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'market_data';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      return res.status(200).json({
        ...stale.data,
        cache_hit: true,
        stale: true,
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch market data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
