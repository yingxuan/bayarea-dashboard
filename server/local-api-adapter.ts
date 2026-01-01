/**
 * Local API Adapter
 * Wraps Vercel serverless functions for local testing
 * 
 * Usage: Import this in server/index.ts to test API functions locally
 */

import type { Request, Response } from 'express';
import marketHandler from '../api/market.js';
import aiNewsHandler from '../api/ai-news.js';
import gossipHandler from '../api/gossip.js';
import dealsHandler from '../api/deals.js';
import restaurantsHandler from '../api/restaurants.js';
import showsHandler from '../api/shows.js';

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

/**
 * Market API route
 */
export async function marketRoute(req: Request, res: Response) {
  const { vercelReq, vercelRes } = expressToVercel(req, res);
  await marketHandler(vercelReq, vercelRes);
}

/**
 * AI News API route
 */
export async function aiNewsRoute(req: Request, res: Response) {
  const { vercelReq, vercelRes } = expressToVercel(req, res);
  await aiNewsHandler(vercelReq, vercelRes);
}

/**
 * Gossip API route
 */
export async function gossipRoute(req: Request, res: Response) {
  const { vercelReq, vercelRes } = expressToVercel(req, res);
  await gossipHandler(vercelReq, vercelRes);
}

/**
 * Deals API route
 */
export async function dealsRoute(req: Request, res: Response) {
  const { vercelReq, vercelRes } = expressToVercel(req, res);
  await dealsHandler(vercelReq, vercelRes);
}

/**
 * Restaurants API route
 */
export async function restaurantsRoute(req: Request, res: Response) {
  const { vercelReq, vercelRes } = expressToVercel(req, res);
  await restaurantsHandler(vercelReq, vercelRes);
}

/**
 * Shows API route
 */
export async function showsRoute(req: Request, res: Response) {
  const { vercelReq, vercelRes } = expressToVercel(req, res);
  await showsHandler(vercelReq, vercelRes);
}
