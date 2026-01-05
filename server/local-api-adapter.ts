/**
 * Local API Adapter
 * Wraps Vercel serverless functions for local testing
 * 
 * Usage: Import this in server/index.ts to test API functions locally
 */

import type { Request, Response } from 'express';
import marketHandler from '../api/market-all.js';
import dealsHandler from '../api/deals.js';
import { handleToday as spendTodayHandler } from '../api/spend/today.js';
import communityHandler from '../api/community/[...slug].js';
import portfolioValueSeriesHandler from '../api/portfolio/value-series.js';

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
    setHeader: (name: string, value: string) => {
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
    await portfolioValueSeriesHandler(vercelReq, vercelRes);
  } catch (error) {
    console.error('[local-api-adapter] Portfolio Value Series route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
