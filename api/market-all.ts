import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMarket } from '../api-handlers/market/market.js';
import { handleMarketNews } from '../api-handlers/market/market-news.js';
import { handleQuotes } from '../api-handlers/market/quotes.js';
import { handleShows } from '../api-handlers/market/shows.js';
import { handleYoutubers } from '../api-handlers/market/youtubers.js';
import { handleMovies } from '../api-handlers/market/movies.js';
import { handleConcerts } from '../api-handlers/market/concerts.js';
import { handleBayAreaMovies } from '../api-handlers/market/bayarea-movies.js';
import { handleWeather } from '../api-handlers/market/weather.js';
import { handleHN } from '../api-handlers/market/hn.js';

const handlerMap: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  market: handleMarket,
  'market-news': handleMarketNews,
  quotes: handleQuotes,
  shows: handleShows,
  youtubers: handleYoutubers,
  movies: handleMovies,
  concerts: handleConcerts,
  'bayarea-movies': handleBayAreaMovies,
  weather: handleWeather,
  hn: handleHN,
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
  if (path.includes('/movies')) return 'movies';
  if (path.includes('/concerts')) return 'concerts';
  if (path.includes('/bayarea-movies')) return 'bayarea-movies';
  if (path.includes('/weather')) return 'weather';
  if (path.includes('/hn')) return 'hn';
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
