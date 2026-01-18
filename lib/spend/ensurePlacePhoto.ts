/// <reference path="../../types/transformers.d.ts" />
import {
  acquirePhotoLock,
  getPhotoRecord,
  releasePhotoLock,
  setPhotoRecord,
  hitTtlSeconds,
  PHOTO_VERSION,
  type PhotoRecord,
} from './photo-cache.js';
import { storePhotoBytes } from './photo-storage.js';
import { kv } from '@vercel/kv';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const LOCK_WAIT_BACKOFF_MS = [400, 800, 1200];
const CANDIDATE_LIMIT = 8;

type PhotoCandidatesResult = { photoNames: string[]; rawPhotos: any[] };

async function fetchPhotoCandidates(placeId: string): Promise<PhotoCandidatesResult> {
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
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const photoNames: string[] = [];
  for (const p of photos.slice(0, CANDIDATE_LIMIT)) {
    const name = typeof p?.name === 'string' ? p.name : null;
    if (name && name.startsWith('places/')) {
      photoNames.push(name);
    }
  }
  return { photoNames, rawPhotos: photos };
}

async function fetchPhotoBytes(
  photoName: string,
  maxWidthPx = 800
): Promise<{ data: ArrayBuffer; contentType?: string }> {
  if (!photoName.startsWith('places/')) {
    throw new Error('invalid_photo_name');
  }
  // Try skipHttpRedirect to get direct URI; fall back to redirect mode if parsing fails.
  const skipRedirectUrl = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${GOOGLE_PLACES_API_KEY}`;
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
    mediaUrl = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${GOOGLE_PLACES_API_KEY}`;
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
    selected?: 'first-photo' | 'fallback-first';
    stage?: string;
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
  source: 'prefetch' | 'ondemand',
  options?: { refresh?: boolean }
): Promise<EnsurePhotoResult> {
  const refresh = options?.refresh === true;
  let debug: EnsurePhotoResult['debug'] = { cache: 'kv-miss', fetch: 'skipped', lock: 'none' };
  let stage: string = 'init';
  if (!GOOGLE_PLACES_API_KEY) {
    return {
      place_id: placeId,
      status: 'failed',
      reason: 'missing_api_key',
      debug,
    };
  }

  const existing = await getPhotoRecord(placeId);
  const versionMismatch = existing?.meta?.version && existing.meta.version !== PHOTO_VERSION;
  const existingResult = refresh || versionMismatch ? null : cachedResult(existing, placeId, source, debug);
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
    stage = 'fetch-details';
    debug = { ...debug, fetch: 'started' };
    // Metric: count real Google Places fetch attempts.
    const metricKey = `metrics:google_places_fetch:v1:${placeId}`;
    const metricCount = await kv.incr(metricKey);
    if (metricCount === 1) {
      await kv.expire(metricKey, hitTtlSeconds());
    }

    console.log('[VERIFY] GOOGLE_CALL_START', { placeId, time: Date.now() });
    const { photoNames, rawPhotos } = await fetchPhotoCandidates(placeId);
    console.log('[VERIFY] GOOGLE_CALL_END', { placeId, time: Date.now() });
    if (process.env.DEBUG_PLACES_PHOTO === '1' && !existing) {
      console.log('[places-photo] ref candidates', { placeId, count: photoNames.length, first: photoNames[0], raw: rawPhotos.slice(0, 3) });
    }
    if (!photoNames.length) {
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

    stage = 'select';
    let selectedPhoto = photoNames[0];
    let selectedMode: EnsurePhotoResult['debug']['selected'] = 'first-photo';

    stage = 'fetch-photo';
    console.log('[VERIFY] GOOGLE_CALL_START', { placeId, time: Date.now() });
    const { data, contentType } = await fetchPhotoBytes(selectedPhoto);
    console.log('[VERIFY] GOOGLE_CALL_END', { placeId, time: Date.now() });
    stage = 'blob-put';
    const stored = await storePhotoBytes(placeId, data, contentType, {
      version: PHOTO_VERSION,
      uniqueSuffix: refresh ? true : undefined,
    });
    stage = 'kv-set';
    await setPhotoRecord(
      placeId,
      {
        url: stored.url,
        source,
        meta: {
          place_id: placeId,
          google_photo_reference: selectedPhoto,
          photo_candidates_count: photoNames.length,
          food_score: undefined,
          selected_photo_name: selectedPhoto,
          top_scores: undefined,
          version: PHOTO_VERSION,
        },
      },
      'hit'
    );
    return {
      place_id: placeId,
      status: 'hit',
      photo_local_url: stored.url,
      source,
      debug: { ...debug, selected: selectedMode, choices: photoNames.length },
    };
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
    return {
      place_id: placeId,
      status: 'failed',
      source,
      reason,
      debug: { ...debug, fetch: 'failed', stage },
    };
  } finally {
    if (lockToken) {
      await releasePhotoLock(placeId, lockToken);
    }
  }
}
