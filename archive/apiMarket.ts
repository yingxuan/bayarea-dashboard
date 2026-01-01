/**
 * API Endpoint: /api/market
 * Returns real-time market data from Google CSE with caching
 */

import { Router } from 'express';
import { getCache, setCache, getStaleCache } from './cacheDB';
import {
  getSPYPrice,
  getGoldPrice,
  getBTCPrice,
  getCAJumboRate,
  getPowerballJackpot,
} from './googleCSE';

const router = Router();

const CACHE_KEY = 'market_data';
const CACHE_TTL = 5 * 60; // 5 minutes

interface MarketDataItem {
  code: string;
  name: string;
  value: number;
  unit: string;
  change?: number;
  changePercent?: number;
  source_name: string;
  source_url: string;
}

interface MarketDataResponse {
  data: MarketDataItem[];
  updated_at: string;
  cache_hit: boolean;
}

/**
 * GET /api/market
 * Returns market data for SPY, Gold, BTC, CA Jumbo Rate, Powerball
 */
router.get('/market', async (req, res) => {
  try {
    // Check cache first
    const cached = getCache(CACHE_KEY);
    if (cached) {
      console.log('[API /market] Cache hit');
      return res.json({
        ...cached,
        cache_hit: true,
      });
    }

    console.log('[API /market] Cache miss, fetching fresh data from Google CSE...');

    // Fetch fresh data from Google CSE
    const [spy, gold, btc, caRate, powerball] = await Promise.allSettled([
      getSPYPrice(),
      getGoldPrice(),
      getBTCPrice(),
      getCAJumboRate(),
      getPowerballJackpot(),
    ]);

    const data: MarketDataItem[] = [];

    // SPY
    if (spy.status === 'fulfilled' && spy.value) {
      data.push({
        code: 'SPY',
        name: 'S&P 500 ETF',
        value: spy.value.value,
        unit: 'USD',
        change: spy.value.change,
        changePercent: spy.value.changePercent,
        source_name: spy.value.source_name,
        source_url: spy.value.source_url,
      });
    }

    // Gold
    if (gold.status === 'fulfilled' && gold.value) {
      data.push({
        code: 'GOLD',
        name: 'Gold',
        value: gold.value.value,
        unit: 'USD/oz',
        source_name: gold.value.source_name,
        source_url: gold.value.source_url,
      });
    }

    // Bitcoin
    if (btc.status === 'fulfilled' && btc.value) {
      data.push({
        code: 'BTC',
        name: 'Bitcoin',
        value: btc.value.value,
        unit: 'USD',
        source_name: btc.value.source_name,
        source_url: btc.value.source_url,
      });
    }

    // CA Jumbo Mortgage Rate
    if (caRate.status === 'fulfilled' && caRate.value) {
      data.push({
        code: 'CA_JUMBO_ARM',
        name: 'California Jumbo Loan 7/1 ARM',
        value: caRate.value.value,
        unit: 'rate',
        source_name: caRate.value.source_name,
        source_url: caRate.value.source_url,
      });
    }

    // Powerball Jackpot
    if (powerball.status === 'fulfilled' && powerball.value) {
      data.push({
        code: 'POWERBALL',
        name: 'Powerball Jackpot',
        value: powerball.value.value,
        unit: 'USD',
        source_name: powerball.value.source_name,
        source_url: powerball.value.source_url,
      });
    }

    const response: MarketDataResponse = {
      data,
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

    // Cache the result
    setCache(CACHE_KEY, response, CACHE_TTL);

    res.json(response);
  } catch (error) {
    console.error('[API /market] Error:', error);

    // Try to return stale cache as fallback
    const stale = getStaleCache(CACHE_KEY);
    if (stale) {
      console.log('[API /market] Returning stale cache as fallback');
      return res.json({
        ...stale,
        cache_hit: true,
        stale: true,
      });
    }

    res.status(500).json({
      error: 'Failed to fetch market data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
