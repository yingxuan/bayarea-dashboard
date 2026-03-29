/**
 * Local API Adapter
 * Wraps Vercel serverless functions for local testing
 * 
 * Usage: Import this in server/index.ts to test API functions locally
 */

import type { Request, Response } from 'express';
import fortuneHandler from '../api/fortune.js';
import marketHandler from '../api/market-all.js';
import dealsHandler from '../api/deals.js';
import { handleToday as spendTodayHandler } from '../lib/spend/today.js';
import communityHandler from '../api/community/[...slug].js';
import portfolioHandler from '../api/portfolio/[...slug].js';
import fanwanHandler from '../api/youtube/fanwan.js';
import musthaveHandler from '../api/spend/musthave.js';
import authHandler from '../api/auth/[...slug].js';
import marketAllHandler from '../api/market-all.js';
import { cache } from '../lib/api-utils.js';
import { clearDedupMap } from '../lib/spend/placesClient.ts';

/**
 * Convert Express Request/Response to Vercel Request/Response
 */
function expressToVercel(req: Request, res: Response) {
  const vercelReq = {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers,
    body: req.body,
  } as any;

  const vercelRes = {
    status: (code: number) => ({
      json: (data: any) => {
        res.status(code).json(data);
      },
      end: () => {
        res.status(code).end();
      },
    }),
    setHeader: (name: string, value: string | string[]) => {
      res.setHeader(name, value);
    },
    json: (data: any) => {
      res.json(data);
    },
    end: () => {
      res.end();
    },
  } as any;

  return { vercelReq, vercelRes };
}

function withHandler(vercelReq: any, handler: string) {
  vercelReq.query = {
    ...(vercelReq.query || {}),
    handler,
  };
}

/**
 * Market API route
 */
export async function marketRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'market');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Market route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Concerts API route
 */
export async function concertsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'concerts');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Concerts route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Weather API route
 */
export async function weatherRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'weather');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Weather route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * HN Top Stories API route
 */
export async function hnRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'hn');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] HN route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Bay Area Chinese Movies (film screenings) API route
 */
export async function bayAreaMoviesRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'bayarea-movies');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Bay Area Movies route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Deals API route
 */
export async function dealsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    await dealsHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Deals route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Shows API route
 */
export async function showsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'shows');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Shows route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Movies API route (院线华语电影)
 */
export async function moviesRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'movies');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Movies route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * YouTubers API route
 */
export async function youtubersRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'youtubers');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] YouTubers route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Quotes API route
 */
export async function quotesRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'quotes');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Quotes route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Fortune API route
 */
export async function fortuneRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    await fortuneHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Fortune route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Fanwan YouTube API route
 */
export async function fanwanRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    await fanwanHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Fanwan route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Dev-only: Clear Places cache
 */
export async function devPlacesClearCacheRoute(req: Request, res: Response) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (process.env.NODE_ENV === 'production' && req.headers['x-dev-admin-token'] !== process.env.DEV_ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Dev cache clearing is disabled' });
  }

  try {
    const cleared: string[] = [];
    for (const key of cache.keys()) {
      if (key.startsWith('places_pool:')) {
        cache.delete(key);
        cleared.push(key);
      }
    }
    clearDedupMap();
    res.status(200).json({ ok: true, cleared, cacheEntries: cache.size });
  } catch (error) {
    console.error('[local-api-adapter] Dev places clear cache route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Must-have canonical data
 */
export async function musthaveRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    await musthaveHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Must-have route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Spend Today API route
 */
export async function spendTodayRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    await spendTodayHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Spend Today route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Leek Community API route
 */
export async function leekCommunityRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'leeks');
    await communityHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Leek Community route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Market News API route
 */
export async function marketNewsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'market-news');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Market News route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Jobs/Layoffs Community API route
 */
export async function jobsCommunityRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'jobs');
    await communityHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Jobs Community route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function startupNewsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'startup-news');
    await marketAllHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Startup News route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function jobMarketTrendRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'job-market-trend');
    await marketAllHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Job Market Trend route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Housing open houses API route
 */
export async function housingOpenHousesRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'housing-open-houses');
    await marketHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Housing Open Houses route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}


/**
 * Offers / interview Community API route
 */
export async function offersCommunityRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'offers');
    await communityHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Offers Community route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Gossip Community API route (1point3acres + TeamBlind)
 */
export async function gossipCommunityRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    withHandler(vercelReq, 'gossip');
    await communityHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Gossip Community route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Portfolio Value Series API route
 */
export async function portfolioValueSeriesRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    vercelReq.query = { ...vercelReq.query, slug: ['value-series'] };
    await portfolioHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Portfolio Value Series route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Auth API route (handles /api/auth/*)
 */
export async function authRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    // Extract slug from URL path
    const path = req.path.replace('/api/auth/', '');
    vercelReq.query = {
      ...(vercelReq.query || {}),
      slug: path ? path.split('/') : [],
    };
    await authHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Auth route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Portfolio Holdings API route
 */
export async function portfolioHoldingsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    vercelReq.query = { ...vercelReq.query, slug: ['holdings'] };
    await portfolioHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Portfolio Holdings route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Portfolio Settings API route
 */
export async function portfolioSettingsRoute(req: Request, res: Response) {
  try {
    const { vercelReq, vercelRes } = expressToVercel(req, res);
    vercelReq.query = { ...vercelReq.query, slug: ['settings'] };
    await portfolioHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Portfolio Settings route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
