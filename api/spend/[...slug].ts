import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleToday } from './today.js';
import { handleNewPlaces } from './new-places.js';
import { handleEnrichPlace } from '../../lib/spend/enrich-place.js';
import { handleEnrichHours } from '../../lib/spend/enrich-hours.js';
import { handlePlacePhoto } from '../../lib/spend/place-photo.js';

function normalizePath(req: VercelRequest): string {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname || '/';
  // Strip the /api/spend prefix if present
  return path.replace(/^\/api\/spend/, '') || '/';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const subpath = normalizePath(req);

  if (subpath === '/' || subpath === '') {
    // default to today
    return handleToday(req, res);
  }

  switch (subpath) {
    case '/today':
      return handleToday(req, res);
    case '/new-places':
      return handleNewPlaces(req, res);
    case '/enrich-place':
      return handleEnrichPlace(req, res);
    case '/enrich-hours':
      return handleEnrichHours(req, res);
    case '/place-photo':
      return handlePlacePhoto(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}
