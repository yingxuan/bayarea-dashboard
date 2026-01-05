import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMarket } from '../api-handlers/market/market.js';
import { handleMarketNews } from '../api-handlers/market/market-news.js';
import { handleQuotes } from '../api-handlers/market/quotes.js';
import { handleShows } from '../api-handlers/market/shows.js';
import { handleYoutubers } from '../api-handlers/market/youtubers.js';

const handlerMap: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  market: handleMarket,
  'market-news': handleMarketNews,
  quotes: handleQuotes,
  shows: handleShows,
  youtubers: handleYoutubers,
};

function normalizePath(req: VercelRequest): string {
  const url = new URL(req.url || '/', 'http://localhost');
  return url.pathname.toLowerCase();
}

function detectHandler(req: VercelRequest): string {
  const handlerQuery = (req.query.handler as string | undefined)?.toLowerCase();
  if (handlerQuery && handlerMap[handlerQuery]) {
    return handlerQuery;
  }
  const path = normalizePath(req);
  if (path.includes('/market-news')) return 'market-news';
  if (path.includes('/quotes')) return 'quotes';
  if (path.includes('/shows')) return 'shows';
  if (path.includes('/youtubers')) return 'youtubers';
  return 'market';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requested = detectHandler(req);
  const selected = handlerMap[requested];
  if (!selected) {
    return res.status(404).json({ error: 'Unknown market handler' });
  }
  return selected(req, res);
}
