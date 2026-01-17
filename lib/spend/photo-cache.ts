import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

export type PhotoSource = 'prefetch' | 'ondemand';

export interface PhotoRecord {
  url?: string;
  updatedAt: string;
  source: PhotoSource;
  status: 'hit' | 'miss' | 'failed';
  meta?: {
    place_id: string;
    google_photo_reference?: string;
    reason?: string;
  };
  // Explicit retry / expiry markers to avoid indefinite suppression.
  expiresAt?: string;
  nextRetryAt?: string;
}

const INDEX_PREFIX = 'placephoto:v1:';
const LOCK_PREFIX = 'placephoto:lock:v1:';

// TTLs (seconds)
const TTL_HIT = 60 * 60 * 24 * 365; // 365 days
const TTL_MISS = 60 * 60 * 24 * 7; // 7 days
const TTL_FAILED = 60 * 30; // 30 minutes
const LOCK_TTL = 60; // 60 seconds

export async function getPhotoRecord(placeId: string): Promise<PhotoRecord | null> {
  if (!placeId) return null;
  const key = INDEX_PREFIX + placeId;
  const rec = await kv.get<PhotoRecord>(key);
  return rec || null;
}

export async function setPhotoRecord(
  placeId: string,
  record: Omit<PhotoRecord, 'updatedAt' | 'status' | 'expiresAt' | 'nextRetryAt'>,
  status: PhotoRecord['status']
): Promise<void> {
  const key = INDEX_PREFIX + placeId;
  const ttl = status === 'hit' ? TTL_HIT : status === 'miss' ? TTL_MISS : TTL_FAILED;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const nextRetryAt = status === 'hit' ? undefined : expiresAt;
  const payload: PhotoRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    status,
    expiresAt,
    nextRetryAt,
  };
  await kv.set(key, payload, { ex: ttl });
}

export async function acquirePhotoLock(
  placeId: string
): Promise<{ state: 'acquired'; token: string } | { state: 'locked' }> {
  const key = LOCK_PREFIX + placeId;
  const token = crypto.randomUUID();
  const ok = await kv.set(key, token, { nx: true, ex: LOCK_TTL });
  return ok ? { state: 'acquired', token } : { state: 'locked' };
}

export async function releasePhotoLock(placeId: string, token: string): Promise<void> {
  const key = LOCK_PREFIX + placeId;
  try {
    const current = await kv.get<string>(key);
    if (current === token) {
      await kv.del(key);
    }
  } catch {
    // best effort
  }
}

export function hitTtlSeconds(): number {
  return TTL_HIT;
}
