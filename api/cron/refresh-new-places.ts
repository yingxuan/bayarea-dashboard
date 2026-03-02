/**
 * Vercel Cron: Refresh 新店打卡 snapshot
 *
 * Schedule: twice a week (Mon + Thu at 8am UTC), fits within 3-day KV TTL.
 * Vercel passes Authorization: Bearer <CRON_SECRET> for security.
 * If CRON_SECRET env var is not set, the endpoint is unprotected
 * (acceptable for manual seeding on first deploy).
 *
 * Vercel Pro required for maxDuration > 10s.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshNewPlacesSnapshot } from '../../lib/spend/new-places-job.js';

export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Enable job mode for this serverless invocation
  process.env.JOB_MODE = '1';

  try {
    const snapshot = await refreshNewPlacesSnapshot();
    console.log(`[cron/refresh-new-places] Done: ${snapshot.places.length} places`);
    return res.status(200).json({
      ok: true,
      generatedAt: snapshot.generatedAt,
      places: snapshot.places.length,
    });
  } catch (error: any) {
    console.error('[cron/refresh-new-places] Failed:', error.message);
    if (error.message === 'refresh_in_progress') {
      return res.status(200).json({ ok: true, skipped: true, reason: 'already running' });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }
}
