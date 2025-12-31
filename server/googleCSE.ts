/**
 * Google Custom Search Engine (CSE) Client
 * Used for fetching real-time market data and news
 */

import axios from 'axios';

const CSE_API_KEY = process.env.GOOGLE_CSE_API_KEY || '';
const CSE_ID = process.env.GOOGLE_CSE_ID || '';
const CSE_API_URL = 'https://www.googleapis.com/customsearch/v1';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

/**
 * Search using Google CSE
 */
export async function searchGoogle(query: string, numResults: number = 5): Promise<SearchResult[]> {
  try {
    const response = await axios.get(CSE_API_URL, {
      params: {
        key: CSE_API_KEY,
        cx: CSE_ID,
        q: query,
        num: numResults,
      },
    });

    if (!response.data.items) {
      console.warn(`No search results found for query: ${query}`);
      return [];
    }

    return response.data.items.map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
    }));
  } catch (error) {
    console.error(`Google CSE search failed for query "${query}":`, error);
    return [];
  }
}

/**
 * Extract number from text using regex
 */
export function extractNumber(text: string): number | null {
  // Remove commas and match numbers with optional decimal points
  const match = text.replace(/,/g, '').match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract percentage from text
 */
export function extractPercentage(text: string): number | null {
  const match = text.match(/(\d+\.?\d*)%/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Check if source is authoritative for financial data
 */
export function isAuthoritativeSource(domain: string): boolean {
  const authoritative = [
    'yahoo.com',
    'finance.yahoo.com',
    'cnbc.com',
    'bloomberg.com',
    'reuters.com',
    'wsj.com',
    'marketwatch.com',
    'investing.com',
    'coindesk.com',
    'coinmarketcap.com',
    'coingecko.com',
    'freddiemac.com',
    'bankrate.com',
    'powerball.com',
    'usamega.com',
  ];
  
  return authoritative.some(auth => domain.includes(auth));
}

/**
 * Get SPY (S&P 500 ETF) price
 */
export async function getSPYPrice(): Promise<{
  value: number;
  change: number;
  changePercent: number;
  source_name: string;
  source_url: string;
} | null> {
  const results = await searchGoogle('SPY price today');
  
  for (const result of results) {
    if (isAuthoritativeSource(result.displayLink)) {
      const price = extractNumber(result.snippet);
      if (price && price > 400 && price < 1000) { // Sanity check
        return {
          value: price,
          change: 0, // Will be calculated from previous cache
          changePercent: 0,
          source_name: result.displayLink,
          source_url: result.link,
        };
      }
    }
  }
  
  return null;
}

/**
 * Get Gold price
 */
export async function getGoldPrice(): Promise<{
  value: number;
  source_name: string;
  source_url: string;
} | null> {
  const results = await searchGoogle('gold price today USD per ounce');
  
  for (const result of results) {
    if (isAuthoritativeSource(result.displayLink)) {
      const price = extractNumber(result.snippet);
      if (price && price > 1000 && price < 10000) { // Sanity check
        return {
          value: price,
          source_name: result.displayLink,
          source_url: result.link,
        };
      }
    }
  }
  
  return null;
}

/**
 * Get Bitcoin price
 */
export async function getBTCPrice(): Promise<{
  value: number;
  source_name: string;
  source_url: string;
} | null> {
  const results = await searchGoogle('bitcoin price USD');
  
  for (const result of results) {
    if (isAuthoritativeSource(result.displayLink)) {
      const price = extractNumber(result.snippet);
      if (price && price > 10000 && price < 200000) { // Sanity check
        return {
          value: price,
          source_name: result.displayLink,
          source_url: result.link,
        };
      }
    }
  }
  
  return null;
}

/**
 * Get California Jumbo Mortgage Rate
 */
export async function getCAJumboRate(): Promise<{
  value: number;
  source_name: string;
  source_url: string;
} | null> {
  const results = await searchGoogle('california jumbo mortgage rate today');
  
  for (const result of results) {
    if (isAuthoritativeSource(result.displayLink)) {
      const rate = extractPercentage(result.snippet);
      if (rate && rate > 3 && rate < 15) { // Sanity check
        return {
          value: rate / 100, // Convert to decimal
          source_name: result.displayLink,
          source_url: result.link,
        };
      }
    }
  }
  
  return null;
}

/**
 * Get Powerball Jackpot
 */
export async function getPowerballJackpot(): Promise<{
  value: number;
  source_name: string;
  source_url: string;
} | null> {
  const results = await searchGoogle('powerball jackpot today');
  
  for (const result of results) {
    if (result.displayLink.includes('powerball') || result.displayLink.includes('usamega')) {
      // Look for million/billion amounts
      const snippet = result.snippet.toLowerCase();
      const millionMatch = snippet.match(/\$?(\d+\.?\d*)\s*million/i);
      const billionMatch = snippet.match(/\$?(\d+\.?\d*)\s*billion/i);
      
      let value = 0;
      if (billionMatch) {
        value = parseFloat(billionMatch[1]) * 1000000000;
      } else if (millionMatch) {
        value = parseFloat(millionMatch[1]) * 1000000;
      }
      
      if (value > 0) {
        return {
          value,
          source_name: result.displayLink,
          source_url: result.link,
        };
      }
    }
  }
  
  return null;
}

/**
 * Get AI/Tech industry news
 */
export async function getAINews(): Promise<Array<{
  title: string;
  url: string;
  source_name: string;
  snippet: string;
}>> {
  const results = await searchGoogle('AI technology news today OR OpenAI OR Meta OR Google', 10);
  
  return results
    .filter(result => isAuthoritativeSource(result.displayLink))
    .slice(0, 5)
    .map(result => ({
      title: result.title,
      url: result.link,
      source_name: result.displayLink,
      snippet: result.snippet,
    }));
}
