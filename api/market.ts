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

/**
 * Extract SPY price from snippet
 * SPY prices are typically $400-$800
 * Avoid matching "500" from "S&P 500"
 */
function extractSPYPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  
  // Pattern 1: Look for price with $ symbol and 2 decimal places
  const dollarPattern = /\$([4-8][\d]{2}\.[\d]{2})/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    const price = parseFloat(dollarMatch[1]);
    if (price >= 400 && price <= 800) {
      return price;
    }
  }
  
  // Pattern 2: Look for 3-digit number with decimals (not "500" alone)
  const pricePattern = /([4-8][\d]{2}\.[\d]{1,2})/;
  const priceMatch = cleaned.match(pricePattern);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price >= 400 && price <= 800) {
      return price;
    }
  }
  
  // Pattern 3: Look for "SPY" followed by price
  const spyAfterPattern = /SPY.*?([4-8][\d]{2}\.[\d]{1,2})/i;
  const spyAfterMatch = cleaned.match(spyAfterPattern);
  if (spyAfterMatch) {
    const price = parseFloat(spyAfterMatch[1]);
    if (price >= 400 && price <= 800) {
      return price;
    }
  }
  
  return null;
}

/**
 * Extract Gold price from snippet
 * Gold prices are typically $2,000-$5,000 per oz
 * Avoid matching "26" from "Feb 26" or other dates
 */
function extractGoldPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  
  // Pattern 1: Look for 4-digit price in gold range with $ symbol
  const dollarPattern = /\$([2-5][\d]{3}\.[\d]{1,2})/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    const price = parseFloat(dollarMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  // Pattern 2: Look for 4-digit number in gold range
  const pricePattern = /([2-5][\d]{3}\.[\d]{1,2})/;
  const priceMatch = cleaned.match(pricePattern);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  // Pattern 3: Look for "gold" followed by 4-digit price
  const goldAfterPattern = /gold.*?([2-5][\d]{3}\.[\d]{1,2})/i;
  const goldAfterMatch = cleaned.match(goldAfterPattern);
  if (goldAfterMatch) {
    const price = parseFloat(goldAfterMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  // Pattern 4: Look for price before "gold"
  const goldBeforePattern = /([2-5][\d]{3}\.[\d]{1,2}).*?gold/i;
  const goldBeforeMatch = cleaned.match(goldBeforePattern);
  if (goldBeforeMatch) {
    const price = parseFloat(goldBeforeMatch[1]);
    if (price >= 2000 && price <= 5000) {
      return price;
    }
  }
  
  return null;
}

/**
 * Extract Bitcoin price from snippet
 * Bitcoin prices are typically $10,000-$150,000
 */
function extractBitcoinPrice(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  
  // Pattern 1: Look for 5-6 digit price with $ symbol
  const dollarPattern = /\$([\d]{5,6}\.[\d]{1,2})/;
  const dollarMatch = cleaned.match(dollarPattern);
  if (dollarMatch) {
    const price = parseFloat(dollarMatch[1]);
    if (price >= 10000 && price <= 150000) {
      return price;
    }
  }
  
  // Pattern 2: Look for 5-6 digit number with decimals
  const pricePattern = /([\d]{5,6}\.[\d]{1,2})/;
  const priceMatch = cleaned.match(pricePattern);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price >= 10000 && price <= 150000) {
      return price;
    }
  }
  
  // Pattern 3: Look for "bitcoin" or "BTC" followed by price
  const btcAfterPattern = /(?:bitcoin|BTC).*?([\d]{5,6}\.[\d]{1,2})/i;
  const btcAfterMatch = cleaned.match(btcAfterPattern);
  if (btcAfterMatch) {
    const price = parseFloat(btcAfterMatch[1]);
    if (price >= 10000 && price <= 150000) {
      return price;
    }
  }
  
  return null;
}

async function fetchSPY(): Promise<MarketDataItem> {
  try {
    const results = await searchGoogle('SPY stock price today site:finance.yahoo.com');
    
    if (!results || results.length === 0) {
      console.log('[fetchSPY] No results from Google CSE');
      return {
        name: 'SPY',
        value: 687.01,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://finance.yahoo.com/quote/SPY/',
        as_of: new Date().toISOString(),
      };
    }
    
    const topResult = results[0];
    const snippet = topResult?.snippet || topResult?.htmlSnippet || topResult?.title || '';
    
    if (!snippet) {
      console.log('[fetchSPY] No snippet available');
      return {
        name: 'SPY',
        value: 687.01,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://finance.yahoo.com/quote/SPY/',
        as_of: new Date().toISOString(),
      };
    }
    
    const price = extractSPYPrice(snippet) || 687.01;
    console.log(`[fetchSPY] Extracted price: ${price} from snippet: ${snippet.substring(0, 100)}`);
    
    return {
      name: 'SPY',
      value: price,
      unit: 'USD',
      source_name: topResult?.displayLink || 'Yahoo Finance',
      source_url: topResult?.link || 'https://finance.yahoo.com/quote/SPY/',
      as_of: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[fetchSPY] Error:', error);
    return {
      name: 'SPY',
      value: 687.01,
      unit: 'USD',
      source_name: 'Fallback',
      source_url: 'https://finance.yahoo.com/quote/SPY/',
      as_of: new Date().toISOString(),
    };
  }
}

async function fetchGold(): Promise<MarketDataItem> {
  try {
    // Try authoritative sources first
    let results = await searchGoogle('gold price today USD per ounce site:kitco.com');
    
    // Fallback to general search but exclude YouTube
    if (!results || results.length === 0) {
      results = await searchGoogle('gold price today USD per ounce site:finance.yahoo.com');
    }
    
    if (!results || results.length === 0) {
      console.log('[fetchGold] No results from Google CSE');
      return {
        name: 'Gold',
        value: 2650,
        unit: 'USD/oz',
        source_name: 'Fallback',
        source_url: 'https://www.kitco.com/charts/livegold.html',
        as_of: new Date().toISOString(),
      };
    }
    
    // Filter out YouTube results
    const filteredResults = results.filter(r => !r?.link?.includes('youtube.com'));
    const topResult = filteredResults[0];
    
    if (!topResult) {
      console.log('[fetchGold] No valid results after filtering');
      return {
        name: 'Gold',
        value: 2650,
        unit: 'USD/oz',
        source_name: 'Fallback',
        source_url: 'https://www.kitco.com/charts/livegold.html',
        as_of: new Date().toISOString(),
      };
    }
    
    const snippet = topResult?.snippet || topResult?.htmlSnippet || topResult?.title || '';
    
    if (!snippet) {
      console.log('[fetchGold] No snippet available');
      return {
        name: 'Gold',
        value: 2650,
        unit: 'USD/oz',
        source_name: 'Fallback',
        source_url: 'https://www.kitco.com/charts/livegold.html',
        as_of: new Date().toISOString(),
      };
    }
    
    const price = extractGoldPrice(snippet) || 2650;
    console.log(`[fetchGold] Extracted price: ${price} from snippet: ${snippet.substring(0, 100)}`);
    
    return {
      name: 'Gold',
      value: price,
      unit: 'USD/oz',
      source_name: topResult?.displayLink || 'Kitco',
      source_url: topResult?.link || 'https://www.kitco.com/charts/livegold.html',
      as_of: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[fetchGold] Error:', error);
    return {
      name: 'Gold',
      value: 2650,
      unit: 'USD/oz',
      source_name: 'Fallback',
      source_url: 'https://www.kitco.com/charts/livegold.html',
      as_of: new Date().toISOString(),
    };
  }
}

async function fetchBTC(): Promise<MarketDataItem> {
  try {
    const results = await searchGoogle('bitcoin price USD site:finance.yahoo.com');
    
    if (!results || results.length === 0) {
      console.log('[fetchBTC] No results from Google CSE');
      return {
        name: 'BTC',
        value: 95000,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://finance.yahoo.com/quote/BTC-USD/',
        as_of: new Date().toISOString(),
      };
    }
    
    const topResult = results[0];
    const snippet = topResult?.snippet || topResult?.htmlSnippet || topResult?.title || '';
    
    if (!snippet) {
      console.log('[fetchBTC] No snippet available');
      return {
        name: 'BTC',
        value: 95000,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://finance.yahoo.com/quote/BTC-USD/',
        as_of: new Date().toISOString(),
      };
    }
    
    // Use specialized Bitcoin price extraction
    const price = extractBitcoinPrice(snippet) || 95000;
    console.log(`[fetchBTC] Extracted price: ${price} from snippet: ${snippet.substring(0, 100)}`);
    
    return {
      name: 'BTC',
      value: price,
      unit: 'USD',
      source_name: topResult?.displayLink || 'Yahoo Finance',
      source_url: topResult?.link || 'https://finance.yahoo.com/quote/BTC-USD/',
      as_of: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[fetchBTC] Error:', error);
    return {
      name: 'BTC',
      value: 95000,
      unit: 'USD',
      source_name: 'Fallback',
      source_url: 'https://finance.yahoo.com/quote/BTC-USD/',
      as_of: new Date().toISOString(),
    };
  }
}

async function fetchMortgageRate(): Promise<MarketDataItem> {
  try {
    // Try authoritative sources first, fallback to general search
    let results = await searchGoogle('California jumbo mortgage rates today site:bankrate.com');
    
    // Fallback if no results from specific sites
    if (!results || results.length === 0) {
      results = await searchGoogle('California jumbo mortgage rates today site:nerdwallet.com');
    }
    
    if (!results || results.length === 0) {
      console.log('[fetchMortgageRate] No results from Google CSE');
      return {
        name: 'CA_JUMBO_ARM',
        value: 0.069,
        unit: 'rate',
        source_name: 'Fallback',
        source_url: 'https://www.bankrate.com/mortgages/mortgage-rates/',
        as_of: new Date().toISOString(),
      };
    }
    
    const topResult = results[0];
    
    if (!topResult) {
      console.log('[fetchMortgageRate] No valid result');
      return {
        name: 'CA_JUMBO_ARM',
        value: 0.069,
        unit: 'rate',
        source_name: 'Fallback',
        source_url: 'https://www.bankrate.com/mortgages/mortgage-rates/',
        as_of: new Date().toISOString(),
      };
    }
    
    // Try to extract rate (as percentage)
    const snippet = topResult?.snippet || topResult?.htmlSnippet || topResult?.title || '';
    
    if (!snippet) {
      console.log('[fetchMortgageRate] No snippet available');
      return {
        name: 'CA_JUMBO_ARM',
        value: 0.069,
        unit: 'rate',
        source_name: 'Fallback',
        source_url: 'https://www.bankrate.com/mortgages/mortgage-rates/',
        as_of: new Date().toISOString(),
      };
    }
    
    // Pattern 1: Look for percentage with % symbol
    const percentPattern = /([\d]+\.[\d]{1,2})%/;
    const percentMatch = snippet.match(percentPattern);
    let rate = 0.069; // Default fallback
    
    if (percentMatch) {
      const extracted = parseFloat(percentMatch[1]) / 100;
      // Mortgage rates typically 3%-10%
      if (extracted >= 0.03 && extracted <= 0.10) {
        rate = extracted;
      }
    } else {
      // Pattern 2: Look for "rate" followed by percentage
      const ratePattern = /rate.*?([\d]+\.[\d]{1,2})%/i;
      const rateMatch = snippet.match(ratePattern);
      if (rateMatch) {
        const extracted = parseFloat(rateMatch[1]) / 100;
        if (extracted >= 0.03 && extracted <= 0.10) {
          rate = extracted;
        }
      }
    }
    console.log(`[fetchMortgageRate] Extracted rate: ${rate} from snippet: ${snippet.substring(0, 100)}`);
    
    return {
      name: 'CA_JUMBO_ARM',
      value: rate,
      unit: 'rate',
      source_name: topResult?.displayLink || 'Bankrate',
      source_url: topResult?.link || 'https://www.bankrate.com/mortgages/mortgage-rates/',
      as_of: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[fetchMortgageRate] Error:', error);
    return {
      name: 'CA_JUMBO_ARM',
      value: 0.069,
      unit: 'rate',
      source_name: 'Fallback',
      source_url: 'https://www.bankrate.com/mortgages/mortgage-rates/',
      as_of: new Date().toISOString(),
    };
  }
}

async function fetchPowerball(): Promise<MarketDataItem> {
  try {
    // Try official powerball.com first with specific query
    let results = await searchGoogle('Powerball jackpot next drawing site:powerball.com');
    
    // Fallback to other lottery sites
    if (!results || results.length === 0) {
      results = await searchGoogle('powerball jackpot site:lottery.com');
    }
    
    if (!results || results.length === 0) {
      console.log('[fetchPowerball] No results from Google CSE');
      return {
        name: 'POWERBALL',
        value: 485000000,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://www.powerball.com/',
        as_of: new Date().toISOString(),
      };
    }
    
    // Filter out YouTube and Yahoo Finance results
    const filteredResults = results.filter(r => {
      const link = r?.link || '';
      return !link.includes('youtube.com') && !link.includes('yahoo.com');
    });
    
    const topResult = filteredResults[0];
    
    if (!topResult) {
      console.log('[fetchPowerball] No valid results after filtering');
      return {
        name: 'POWERBALL',
        value: 485000000,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://www.powerball.com/',
        as_of: new Date().toISOString(),
      };
    }
    
    const snippet = topResult?.snippet || topResult?.htmlSnippet || topResult?.title || '';
    
    if (!snippet) {
      console.log('[fetchPowerball] No snippet available');
      return {
        name: 'POWERBALL',
        value: 485000000,
        unit: 'USD',
        source_name: 'Fallback',
        source_url: 'https://www.powerball.com/',
        as_of: new Date().toISOString(),
      };
    }
    
    // Try to extract jackpot amount (in millions or billions)
    // Pattern 1: Billion format
    const billionPattern = /\$?([\d,]+(?:\.[\d]+)?)\s*(?:billion|B)/i;
    const billionMatch = snippet.match(billionPattern);
    let amount = 485000000; // Default fallback
    
    if (billionMatch) {
      const extracted = parseFloat(billionMatch[1].replace(/,/g, '')) * 1000000000;
      if (extracted >= 100000000 && extracted <= 10000000000) {
        amount = extracted;
      }
    } else {
      // Pattern 2: Million format
      const millionPattern = /\$?([\d,]+(?:\.[\d]+)?)\s*(?:million|M)/i;
      const millionMatch = snippet.match(millionPattern);
      if (millionMatch) {
        const extracted = parseFloat(millionMatch[1].replace(/,/g, '')) * 1000000;
        if (extracted >= 100000000 && extracted <= 10000000000) {
          amount = extracted;
        }
      }
    }
    
    console.log(`[fetchPowerball] Extracted amount: $${amount} from snippet: ${snippet.substring(0, 100)}`);
    
    return {
      name: 'POWERBALL',
      value: amount,
      unit: 'USD',
      source_name: topResult?.displayLink || 'Powerball.com',
      source_url: topResult?.link || 'https://www.powerball.com/',
      as_of: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[fetchPowerball] Error:', error);
    return {
      name: 'POWERBALL',
      value: 485000000,
      unit: 'USD',
      source_name: 'Fallback',
      source_url: 'https://www.powerball.com/',
      as_of: new Date().toISOString(),
    };
  }
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
