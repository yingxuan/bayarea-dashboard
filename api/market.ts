/**
 * Vercel Serverless Function: /api/market
 * HYBRID APPROACH:
 * - Prices from stable APIs (CoinGecko, Stooq)
 * - Google CSE NOT used for price extraction
 * - source_url provides clickable reference
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// In-memory cache (persists across invocations in same instance)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Standard market data item structure
 * Follows: {status, value, asOf, source, ttlSeconds, error?}
 */
interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
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
 * Fetch Bitcoin price from CoinGecko API
 */
async function fetchBTC(): Promise<MarketDataItem> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const price = data?.bitcoin?.usd;
    
    if (!price || typeof price !== 'number') {
      throw new Error('Invalid price data from CoinGecko');
    }
    
    console.log(`[fetchBTC] CoinGecko API returned: $${price}`);
    
    const now = new Date().toISOString();
    return {
      name: 'BTC',
      value: price,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'CoinGecko',
        url: 'https://www.coingecko.com/en/coins/bitcoin',
      },
      ttlSeconds: 600, // 10 minutes
      // Legacy fields for backward compatibility
      source_name: 'CoinGecko',
      source_url: 'https://www.coingecko.com/en/coins/bitcoin',
      as_of: now,
      debug: {
        data_source: 'coingecko_api',
        api_response: { bitcoin: { usd: price } },
      },
    };
  } catch (error) {
    console.error('[fetchBTC] Error:', error);
    const now = new Date().toISOString();
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
 * Fetch SPY price from Stooq API
 */
async function fetchSPY(): Promise<MarketDataItem> {
  try {
    const response = await fetch('https://stooq.com/q/l/?s=spy.us&f=sd2t2ohlcv&h&e=csv');
    
    if (!response.ok) {
      throw new Error(`Stooq API error: ${response.statusText}`);
    }
    
    const csv = await response.text();
    const lines = csv.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error('Invalid CSV response from Stooq');
    }
    
    // Parse CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const dataLine = lines[1];
    const fields = dataLine.split(',');
    const closePrice = parseFloat(fields[6]); // Close price is 7th field (index 6)
    
    if (isNaN(closePrice) || closePrice <= 0) {
      throw new Error(`Invalid close price: ${fields[6]}`);
    }
    
    console.log(`[fetchSPY] Stooq API returned: $${closePrice}`);
    
    const now = new Date().toISOString();
    return {
      name: 'SPY',
      value: closePrice,
      unit: 'USD',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://finance.yahoo.com/quote/SPY/',
      },
      ttlSeconds: 600, // 10 minutes
      // Legacy fields for backward compatibility
      source_name: 'Stooq',
      source_url: 'https://finance.yahoo.com/quote/SPY/',
      as_of: now,
      debug: {
        data_source: 'stooq_api',
        api_response: { close: closePrice, raw_csv: dataLine },
      },
    };
  } catch (error) {
    console.error('[fetchSPY] Error:', error);
    const now = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'SPY',
      value: 'Unavailable',
      unit: 'USD',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://finance.yahoo.com/quote/SPY/',
      },
      ttlSeconds: 600,
      error: errorMsg,
      // Legacy fields for backward compatibility
      source_name: 'Stooq',
      source_url: 'https://finance.yahoo.com/quote/SPY/',
      as_of: now,
      debug: {
        data_source: 'stooq_api',
        error: errorMsg,
      },
    };
  }
}

/**
 * Fetch Gold (XAUUSD) price from Stooq API
 */
async function fetchGold(): Promise<MarketDataItem> {
  try {
    const response = await fetch('https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv');
    
    if (!response.ok) {
      throw new Error(`Stooq API error: ${response.statusText}`);
    }
    
    const csv = await response.text();
    const lines = csv.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error('Invalid CSV response from Stooq');
    }
    
    // Parse CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const dataLine = lines[1];
    const fields = dataLine.split(',');
    const closePrice = parseFloat(fields[6]); // Close price is 7th field (index 6)
    
    if (isNaN(closePrice) || closePrice <= 0) {
      throw new Error(`Invalid close price: ${fields[6]}`);
    }
    
    console.log(`[fetchGold] Stooq API returned: $${closePrice}`);
    
    const now = new Date().toISOString();
    return {
      name: 'Gold',
      value: closePrice,
      unit: 'USD/oz',
      status: 'ok' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      },
      ttlSeconds: 600, // 10 minutes
      // Legacy fields for backward compatibility
      source_name: 'Stooq',
      source_url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      as_of: now,
      debug: {
        data_source: 'stooq_api',
        api_response: { close: closePrice, raw_csv: dataLine },
      },
    };
  } catch (error) {
    console.error('[fetchGold] Error:', error);
    const now = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'Gold',
      value: 'Unavailable',
      unit: 'USD/oz',
      status: 'unavailable' as const,
      asOf: now,
      source: {
        name: 'Stooq',
        url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      },
      ttlSeconds: 600,
      error: errorMsg,
      // Legacy fields for backward compatibility
      source_name: 'Stooq',
      source_url: 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices',
      as_of: now,
      debug: {
        data_source: 'stooq_api',
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
  // Set CORS headers (frontend on manus.space, backend on vercel.app)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Check for cache bypass parameter
    const nocache = req.query.nocache === '1' || req.query.nocache === 'true';
    const cacheKey = 'market_data';
    const cached = cache.get(cacheKey);
    const now = Date.now();
    
    // Calculate cache metadata
    let cacheAgeSeconds = 0;
    let cacheExpiresInSeconds = Math.floor(CACHE_TTL / 1000);
    
    if (cached) {
      cacheAgeSeconds = Math.floor((now - cached.timestamp) / 1000);
      const remainingMs = CACHE_TTL - (now - cached.timestamp);
      cacheExpiresInSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    }
    
    // Return cached data if valid and not bypassed
    if (!nocache && cached && now - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cacheAgeSeconds,
        cache_expires_in_seconds: cacheExpiresInSeconds,
        cache_key: cacheKey,
      });
    }
    
    // Log cache bypass
    if (nocache) {
      console.log('[API /api/market] Cache bypass requested via ?nocache=1');
    }
    
    // Fetch fresh data from APIs
    const [spy, gold, btc, mortgage, powerball] = await Promise.all([
      fetchSPY(),
      fetchGold(),
      fetchBTC(),
      fetchMortgageRate(),
      fetchPowerball(),
    ]);
    
    const fetchedAt = new Date();
    const response = {
      data: {
        spy,
        gold,
        btc,
        mortgage,
        powerball,
      },
      updated_at: fetchedAt.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      fetched_at: fetchedAt.toISOString(),
      cache_hit: false,
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: Math.floor(CACHE_TTL / 1000),
      cache_key: cacheKey,
      age: 0,
      expiry: Math.floor(CACHE_TTL / 1000),
    };
    
    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });
    
    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/market] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'market_data';
    const stale = cache.get(cacheKey);
    
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
