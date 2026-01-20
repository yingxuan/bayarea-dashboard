import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { ensurePlacePhoto } from './ensurePlacePhoto.js';
import { getPhotoRecord } from './photo-cache.js';
import { PHOTO_VERSION } from './photo-cache.js';

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_KV_TTL_SEC = 120;

// best-effort in-memory fallback (cold starts reset)
const rateMap = new Map<string, { count: number; ts: number }>();

function getClientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const xffValue = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff : undefined;
  const forwarded = xffValue ? xffValue.split(',')[0]?.trim() : undefined;
  const xReal = req.headers['x-real-ip'];
  const realIp = Array.isArray(xReal) ? xReal[0] : xReal;
  const socketIp = req.socket.remoteAddress;
  return forwarded || (typeof realIp === 'string' ? realIp : undefined) || socketIp || 'unknown';
}

function isPlaceIdValid(placeId: string): boolean {
  // Google place_id are typically ~27 chars; allow safe chars and reasonable length.
  return /^[A-Za-z0-9_-]{5,256}$/.test(placeId);
}

function isRetryable(record?: { nextRetryAt?: string; expiresAt?: string }): boolean {
  if (!record) return true;
  const now = Date.now();
  if (record.nextRetryAt && new Date(record.nextRetryAt).getTime() <= now) return true;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now) return true;
  return false;
}

function checkRateLimitMemory(ip: string): { allowed: boolean; remaining: number; resetSec: number } {
  const now = Date.now();
  const rec = rateMap.get(ip);
  if (!rec || now - rec.ts > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, ts: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }
  if (rec.count >= RATE_LIMIT_MAX) {
    const elapsed = now - rec.ts;
    const resetSec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000));
    return { allowed: false, remaining: 0, resetSec };
  }
  rec.count += 1;
  const elapsed = now - rec.ts;
  const resetSec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000));
  return { allowed: true, remaining: RATE_LIMIT_MAX - rec.count, resetSec };
}

async function checkRateLimitKV(
  ip: string
): Promise<{ allowed: boolean; remaining: number; resetSec: number } | null> {
  const now = Date.now();
  const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const key = `rl:place-photo:v1:${ip}:${bucket}`;
  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, RATE_LIMIT_KV_TTL_SEC);
    }
    const allowed = count <= RATE_LIMIT_MAX;
    const remaining = Math.max(0, RATE_LIMIT_MAX - count);
    const resetMs = (bucket + 1) * RATE_LIMIT_WINDOW_MS - now;
    const resetSec = Math.max(1, Math.ceil(resetMs / 1000));
    return { allowed, remaining, resetSec };
  } catch (err) {
    console.warn('[place-photo] rate limit KV fallback', err);
    return null;
  }
}

function writeRateHeaders(
  res: VercelResponse,
  info: { remaining: number; resetSec: number },
  limit: number = RATE_LIMIT_MAX
) {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, info.remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.max(0, Math.ceil(info.resetSec))));
}

async function setFetchCountHeader(res: VercelResponse, placeId: string): Promise<void> {
  try {
    const count = (await kv.get<number>(`metrics:google_places_fetch:v1:${placeId}`)) ?? 0;
    res.setHeader('X-Google-Fetch-Count', String(count));
  } catch {
    res.setHeader('X-Google-Fetch-Count', 'unknown');
  }
}

export async function handlePlacePhoto(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Photo-Version', PHOTO_VERSION);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const placeId = ((req.query.place_id as string) || '').trim();
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  res.setHeader('X-Photo-Refresh', refresh ? '1' : '0');
  if (!placeId) {
    return res.status(400).json({ error: 'place_id required' });
  }
  if (placeId.startsWith('seed_')) {
    return res.status(400).json({ error: 'invalid_place_id' });
  }
  if (!isPlaceIdValid(placeId)) {
    return res.status(400).json({ error: 'invalid_place_id' });
  }

  const ip = getClientIp(req);
  const kvRate = await checkRateLimitKV(ip);
  const rate = kvRate ?? checkRateLimitMemory(ip);
  writeRateHeaders(res, rate);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rate.resetSec))));
    return res.status(429).json({ error: 'rate_limited' });
  }

  try {
    const cached = await getPhotoRecord(placeId);
    const cacheDebug =
      cached?.status === 'hit'
        ? 'kv-hit'
        : cached?.status === 'miss'
        ? 'negative-hit'
        : cached?.status === 'failed'
        ? 'failed-hit'
        : 'kv-miss';

    if (!refresh && cached?.status === 'hit' && cached.url && cached.meta?.version === PHOTO_VERSION) {
      await setFetchCountHeader(res, placeId);
      res.setHeader('X-Photo-Source', cacheDebug);
      res.setHeader('X-Photo-Fetch', 'skipped');
      res.setHeader('X-Photo-Lock', 'none');
      res.setHeader('X-Photo-Cache', 'hit');
      return res.status(200).json({
        place_id: placeId,
        photo_local_url: cached.url,
        status: cached.status,
        source: cached.source,
      });
    }

    if (!refresh && (cached?.status === 'miss' || cached?.status === 'failed') && !isRetryable(cached)) {
      await setFetchCountHeader(res, placeId);
      res.setHeader('X-Photo-Source', cacheDebug);
      res.setHeader('X-Photo-Fetch', 'skipped');
      res.setHeader('X-Photo-Lock', 'none');
      res.setHeader('X-Photo-Cache', 'hit');
      return res.status(200).json({
        place_id: placeId,
        photo_local_url: null,
        status: cached.status,
        source: cached.source,
        reason: cached.meta?.reason,
      });
    }

    if (refresh) {
      res.setHeader('X-Photo-Cache', 'bypass');
    }

    const result = await ensurePlacePhoto(placeId, 'ondemand', { refresh });
    const safeDebug = result.debug || { cache: 'kv-miss', fetch: 'skipped', lock: 'none' };
    await setFetchCountHeader(res, placeId);
    if (safeDebug.selected) {
      res.setHeader('X-Photo-Selected', safeDebug.selected);
    }

    res.setHeader('X-Photo-Source', safeDebug.cache);
    res.setHeader('X-Photo-Fetch', safeDebug.fetch);
    res.setHeader('X-Photo-Lock', safeDebug.lock);
    if (!refresh) {
      res.setHeader('X-Photo-Cache', safeDebug.cache === 'kv-hit' ? 'hit' : 'miss');
    }

    return res.status(200).json({
      place_id: placeId,
      photo_local_url: result.photo_local_url ?? null,
      status: result.status,
      source: result.source,
      reason: result.reason,
    });
  } catch (error: any) {
    console.error('[place-photo] error', error);
    res.setHeader('X-Photo-Version', PHOTO_VERSION);
    res.setHeader('X-Photo-Stage', 'handler');
    return res.status(200).json({
      place_id: placeId || '',
      status: 'failed',
      reason: error?.message || 'unknown',
    });
  }
}
