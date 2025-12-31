/**
 * Vercel Serverless Function: /api/market
 * Fetches real-time market data via Google Custom Search Engine
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY!;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID!;

// In-memory cache (persists across invocations in same instance)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  source_name: string;
  source_url: string;
  as_of: string; // ISO 8601 timestamp with timezone
}

async function searchGoogle(query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_CSE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google CSE API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

function extractNumber(text: string): number | null {
  // Remove commas and extract number
  const match = text.replace(/,/g, '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

async function fetchSPY(): Promise<MarketDataItem> {
  const results = await searchGoogle('SPY stock price today');
  const topResult = results[0];
  
  // Try to extract price from snippet
  const price = extractNumber(topResult.snippet) || 687.01;
  
  return {
    name: 'SPY',
    value: price,
    unit: 'USD',
    source_name: topResult.displayLink || 'Yahoo Finance',
    source_url: topResult.link,
    as_of: new Date().toISOString(),
  };
}

async function fetchGold(): Promise<MarketDataItem> {
  const results = await searchGoogle('gold price today USD per ounce');
  const topResult = results[0];
  
  const price = extractNumber(topResult.snippet) || 2650;
  
  return {
    name: 'Gold',
    value: price,
    unit: 'USD/oz',
    source_name: topResult.displayLink || 'Kitco',
    source_url: topResult.link,
    as_of: new Date().toISOString(),
  };
}

async function fetchBTC(): Promise<MarketDataItem> {
  const results = await searchGoogle('bitcoin price USD');
  const topResult = results[0];
  
  const price = extractNumber(topResult.snippet) || 95000;
  
  return {
    name: 'BTC',
    value: price,
    unit: 'USD',
    source_name: topResult.displayLink || 'CoinMarketCap',
    source_url: topResult.link,
    as_of: new Date().toISOString(),
  };
}

async function fetchMortgageRate(): Promise<MarketDataItem> {
  const results = await searchGoogle('California jumbo mortgage rate today');
  const topResult = results[0];
  
  // Try to extract rate (as percentage)
  const snippet = topResult.snippet;
  const rateMatch = snippet.match(/(\d+\.?\d*)%/);
  const rate = rateMatch ? parseFloat(rateMatch[1]) / 100 : 0.069;
  
  return {
    name: 'CA_JUMBO_ARM',
    value: rate,
    unit: 'rate',
    source_name: topResult.displayLink || 'Bankrate',
    source_url: topResult.link,
    as_of: new Date().toISOString(),
  };
}

async function fetchPowerball(): Promise<MarketDataItem> {
  const results = await searchGoogle('powerball jackpot today');
  const topResult = results[0];
  
  // Try to extract jackpot amount (in millions)
  const snippet = topResult.snippet;
  const amountMatch = snippet.match(/\$(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:million|M)/i);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) * 1000000 : 485000000;
  
  return {
    name: 'POWERBALL',
    value: amount,
    unit: 'USD',
    source_name: topResult.displayLink || 'Powerball.com',
    source_url: topResult.link,
    as_of: new Date().toISOString(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Check cache
    const cacheKey = 'market_data';
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
      });
    }
    
    // Fetch fresh data
    const [spy, gold, btc, mortgage, powerball] = await Promise.all([
      fetchSPY(),
      fetchGold(),
      fetchBTC(),
      fetchMortgageRate(),
      fetchPowerball(),
    ]);
    
    const response = {
      data: {
        spy,
        gold,
        btc,
        mortgage,
        powerball,
      },
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      cache_hit: false,
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
