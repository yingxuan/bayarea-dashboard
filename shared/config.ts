/**
 * Shared Configuration
 * Centralized constants for TTL, timeouts, and API URLs
 */

/**
 * Cache TTL (Time To Live) in milliseconds
 */
export const CACHE_TTL = {
  // Market data updates frequently
  MARKET: 10 * 60 * 1000, // 10 minutes
  
  // News and gossip update moderately
  NEWS: 30 * 60 * 1000, // 30 minutes
  GOSSIP: 30 * 60 * 1000, // 30 minutes
  DEALS: 30 * 60 * 1000, // 30 minutes
  
  // Restaurants and shows update slowly
  RESTAURANTS: 12 * 60 * 60 * 1000, // 12 hours
  SHOWS: 12 * 60 * 60 * 1000, // 12 hours
} as const;

/**
 * Fetch timeout in milliseconds
 */
export const FETCH_TIMEOUT_MS = 5000; // 5 seconds

/**
 * API Base URLs
 */
export const API_URLS = {
  // News APIs
  NEWSAPI_EVERYTHING: 'https://newsapi.org/v2/everything',
  NEWSAPI_HEADLINES: 'https://newsapi.org/v2/top-headlines',
  
  // Community APIs
  HACKER_NEWS: 'https://hacker-news.firebaseio.com/v0',
  REDDIT: 'https://www.reddit.com',
  
  // Data APIs
  COINGECKO: 'https://api.coingecko.com/api/v3',
  STOOQ: 'https://stooq.com/q/l',
  
  // Entertainment APIs
  TMDB: 'https://api.themoviedb.org/3',
  TMDB_IMAGE: 'https://image.tmdb.org/t/p/w500',
  TMDB_PAGE: 'https://www.themoviedb.org',
  
  // Food APIs
  YELP: 'https://api.yelp.com/v3/businesses/search',
  
  // Third-party data services
  YAHOO_FINANCE_API: process.env.BUILT_IN_FORGE_API_URL || 'https://forge.manus.im',
  GOOGLE_CSE: 'https://www.googleapis.com/customsearch/v1',
} as const;

/**
 * Source information (for display in UI)
 */
export const SOURCE_INFO = {
  NEWSAPI: {
    name: 'NewsAPI.org',
    url: 'https://newsapi.org/',
  },
  HACKER_NEWS: {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com/',
  },
  REDDIT: {
    name: 'Reddit',
    url: 'https://www.reddit.com/',
  },
  COINGECKO: {
    name: 'CoinGecko',
    url: 'https://www.coingecko.com/',
  },
  STOOQ: {
    name: 'Stooq',
    url: 'https://stooq.com/',
  },
  YAHOO_FINANCE: {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/',
  },
  GOOGLE_CSE: {
    name: 'Google Custom Search',
    url: 'https://developers.google.com/custom-search',
  },
  TMDB: {
    name: 'TMDB',
    url: 'https://www.themoviedb.org/',
  },
  YELP: {
    name: 'Yelp',
    url: 'https://www.yelp.com/',
  },
} as const;

/**
 * Helper: Convert TTL from milliseconds to seconds
 */
export function ttlMsToSeconds(ttlMs: number): number {
  return Math.floor(ttlMs / 1000);
}

/**
 * Helper: Get cache TTL for a specific data type
 */
export function getCacheTtl(dataType: keyof typeof CACHE_TTL): number {
  return CACHE_TTL[dataType];
}
