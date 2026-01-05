import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGossip } from '../../api-handlers/community/gossip.js';
import { handleLeeks } from '../../api-handlers/community/leeks.js';

function normalizePath(req: VercelRequest): string {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname || '/';
  return path.replace(/^\/api\/community/, '') || '/';
}

function detectHandler(req: VercelRequest): string {
  const handlerQuery = (req.query?.handler as string | undefined)?.toLowerCase();
  if (handlerQuery) return handlerQuery;
  return normalizePath(req).toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const subpath = detectHandler(req);

  switch (subpath) {
    case '/gossip':
    case 'gossip':
      return handleGossip(req, res);
    case '/leeks':
    case 'leeks':
      return handleLeeks(req, res);
    case '/':
    case '':
      return handleLeeks(req, res);
    default:
      return res.status(404).json({ error: 'Community route not found' });
  }
}
