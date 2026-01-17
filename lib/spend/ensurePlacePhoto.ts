import {
  acquirePhotoLock,
  getPhotoRecord,
  releasePhotoLock,
  setPhotoRecord,
  hitTtlSeconds,
  type PhotoRecord,
} from './photo-cache.js';
import { storePhotoBytes } from './photo-storage.js';
import { kv } from '@vercel/kv';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const LOCK_WAIT_BACKOFF_MS = [400, 800, 1200];

type PhotoReferenceResult = { photoName: string | null; rawPhoto?: any };

async function fetchPhotoReference(placeId: string): Promise<PhotoReferenceResult> {
  const url = `${PLACES_API_BASE}/places/${placeId}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'photos.name',
    },
  });

  if (!resp.ok) {
    throw new Error(`place details error ${resp.status}`);
  }
  const data: any = await resp.json();
  const photos = data.photos || [];
  if (!photos.length) return { photoName: null };
  const first = photos[0];
  const name = typeof first?.name === 'string' ? first.name : null;
  const isValidName = name?.startsWith('places/');
  return { photoName: isValidName ? name : null, rawPhoto: first };
}

async function fetchPhotoBytes(photoName: string): Promise<{ data: ArrayBuffer; contentType?: string }> {
  if (!photoName.startsWith('places/')) {
    throw new Error('invalid_photo_name');
  }
  // Try skipHttpRedirect to get direct URI; fall back to redirect mode if parsing fails.
  const skipRedirectUrl = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${GOOGLE_PLACES_API_KEY}`;
  let mediaUrl = skipRedirectUrl;
  let useRedirectFallback = false;

  let resp = await fetch(skipRedirectUrl, { method: 'GET' });
  if (resp.ok) {
    const bodyText = await resp.text();
    try {
      const json = JSON.parse(bodyText);
      if (json.photoUri || json.mediaUri) {
        mediaUrl = json.photoUri || json.mediaUri;
      } else {
        useRedirectFallback = true;
      }
    } catch {
      useRedirectFallback = true;
    }
  } else {
    useRedirectFallback = true;
  }

  if (useRedirectFallback) {
    mediaUrl = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=800&key=${GOOGLE_PLACES_API_KEY}`;
  }

  resp = await fetch(mediaUrl);
  if (!resp.ok) {
    throw new Error(`photo fetch error ${resp.status}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  const contentType = resp.headers.get('content-type') || undefined;
  return { data: arrayBuf, contentType };
}

export interface EnsurePhotoResult {
  place_id: string;
  photo_local_url?: string;
  status: 'hit' | 'miss' | 'failed';
  source?: 'prefetch' | 'ondemand';
  fromCache?: boolean;
  reason?: string;
  debug: {
    cache: 'kv-hit' | 'kv-miss' | 'negative-hit' | 'failed-hit';
    fetch: 'skipped' | 'started' | 'failed';
    lock: 'none' | 'acquired' | 'waited';
    choices?: number;
  };
}

function isRetryable(record: PhotoRecord): boolean {
  const now = Date.now();
  if (record.nextRetryAt && new Date(record.nextRetryAt).getTime() <= now) return true;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachedResult(
  record: PhotoRecord | null,
  placeId: string,
  source: 'prefetch' | 'ondemand',
  debug: EnsurePhotoResult['debug']
): EnsurePhotoResult | null {
  if (!record) return null;

  const cacheDebug: EnsurePhotoResult['debug']['cache'] =
    record.status === 'hit' ? 'kv-hit' : record.status === 'miss' ? 'negative-hit' : 'failed-hit';
  const common = {
    place_id: record.meta?.place_id || placeId,
    source: record.source ?? source,
    fromCache: true,
    reason: record.meta?.reason,
    debug: { ...debug, cache: cacheDebug, fetch: 'skipped' as const },
  };

  if (record.status === 'hit' && record.url) {
    return { ...common, status: 'hit', photo_local_url: record.url };
  }
  if (record.status === 'hit') return null; // retry if malformed

  if (record.status === 'miss') {
    if (!isRetryable(record)) {
      return { ...common, status: 'miss', reason: record.meta?.reason || 'no_photo' };
    }
    return null;
  }

  if (record.status === 'failed') {
    if (!isRetryable(record)) {
      return { ...common, status: 'failed', reason: record.meta?.reason || 'fetch_failed' };
    }
    return null;
  }

  return null;
}

export async function ensurePlacePhoto(
  placeId: string,
  source: 'prefetch' | 'ondemand'
): Promise<EnsurePhotoResult> {
  let debug: EnsurePhotoResult['debug'] = { cache: 'kv-miss', fetch: 'skipped', lock: 'none' };
  if (!GOOGLE_PLACES_API_KEY) {
    return {
      place_id: placeId,
      status: 'failed',
      reason: 'missing_api_key',
      debug,
    };
  }

  const existing = await getPhotoRecord(placeId);
  const existingResult = cachedResult(existing, placeId, source, debug);
  if (existingResult) {
    return existingResult;
  } else if (existing) {
    debug = { ...debug, cache: existing.status === 'miss' ? 'negative-hit' : 'failed-hit' };
  }

  let lockToken: string | null = null;
  const lockState = await acquirePhotoLock(placeId);
  if (lockState.state === 'acquired') {
    lockToken = lockState.token;
    debug = { ...debug, lock: 'acquired' };
  } else {
    debug = { ...debug, lock: 'waited' };
    for (const backoff of LOCK_WAIT_BACKOFF_MS) {
      await sleep(backoff);
      const afterWait = await getPhotoRecord(placeId);
      const waitResult = cachedResult(afterWait, placeId, source, debug);
      if (waitResult) {
        return waitResult;
      }
    }
    return {
      place_id: placeId,
      status: 'miss',
      source,
      reason: 'fetching',
      debug,
    };
  }

  try {
    debug = { ...debug, fetch: 'started' };
    // Metric: count real Google Places fetch attempts.
    const metricKey = `metrics:google_places_fetch:v1:${placeId}`;
    const metricCount = await kv.incr(metricKey);
    if (metricCount === 1) {
      await kv.expire(metricKey, hitTtlSeconds());
    }

    console.log('[VERIFY] GOOGLE_CALL_START', { placeId, time: Date.now() });
    const { photoName, rawPhoto } = await fetchPhotoReference(placeId);
    console.log('[VERIFY] GOOGLE_CALL_END', { placeId, time: Date.now() });
    if (process.env.DEBUG_PLACES_PHOTO === '1' && !existing) {
      console.log('[places-photo] ref result', { placeId, photoName, rawPhoto });
    }
    if (!photoName) {
      await setPhotoRecord(
        placeId,
        {
          url: undefined,
          source,
          meta: { place_id: placeId, reason: 'no_photo_or_no_photos_name' },
        },
        'miss'
      );
      return {
        place_id: placeId,
        status: 'miss',
        source,
        reason: 'no_photo_or_no_photos_name',
        debug,
      };
    }

    console.log('[VERIFY] GOOGLE_CALL_START', { placeId, time: Date.now() });
    const { data, contentType } = await fetchPhotoBytes(photoName);
    console.log('[VERIFY] GOOGLE_CALL_END', { placeId, time: Date.now() });
    const stored = await storePhotoBytes(placeId, data, contentType);
    await setPhotoRecord(
      placeId,
      {
        url: stored.url,
        source,
        meta: { place_id: placeId, google_photo_reference: photoName },
      },
      'hit'
    );
    return { place_id: placeId, status: 'hit', photo_local_url: stored.url, source, debug };
  } catch (error: any) {
    const reason = error?.message || 'fetch_failed';
    await setPhotoRecord(
      placeId,
      {
        url: undefined,
        source,
        meta: { place_id: placeId, reason },
      },
      'failed'
    );
    return { place_id: placeId, status: 'failed', source, reason, debug: { ...debug, fetch: 'failed' } };
  } finally {
    if (lockToken) {
      await releasePhotoLock(placeId, lockToken);
    }
  }
}
