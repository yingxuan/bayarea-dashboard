import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleToday } from '../../lib/spend/today.js';
import { handleNewPlaces } from '../../lib/spend/new-places-runtime.js';
import { handleEnrichPlace } from '../../lib/spend/enrich-place.js';
import { handleEnrichHours } from '../../lib/spend/enrich-hours.js';
import { handlePlacePhoto } from '../../lib/spend/place-photo.js';
import { refreshNewPlacesSnapshot } from '../../lib/spend/new-places-job.js';

function normalizePath(req: VercelRequest): string {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname || '/';
  // Strip the /api/spend prefix if present
  return path.replace(/^\/api\/spend/, '') || '/';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
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
    case '/cron-refresh': {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      process.env.JOB_MODE = '1';
      try {
        const snapshot = await refreshNewPlacesSnapshot();
        return res.status(200).json({ ok: true, generatedAt: snapshot.generatedAt, places: snapshot.places.length });
      } catch (error: any) {
        if (error.message === 'refresh_in_progress') {
          return res.status(200).json({ ok: true, skipped: true, reason: 'already running' });
        }
        return res.status(500).json({ ok: false, error: error.message });
      }
    }
    default:
      res.status(404).json({ error: 'Not found' });
  }
}

export const config = { maxDuration: 300 };
