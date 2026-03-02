import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { fetchPlaceDetails, searchTextPlaces } from './placesClient.js';
import type { PlaceDetailsResponse } from './placesClient.js';
import { SNAPSHOT_KEY, WINDOW_DAYS, WINDOW_MS } from './new-places-config.js';
import type { NewPlaceEntry, NewPlacesSnapshot } from './new-places-types.js';

const SNAPSHOT_TTL_SECONDS = 3 * 24 * 60 * 60;
const TILE_RADIUS_METERS = 4500;
const RESULTS_PER_QUERY = 20;
const MAX_CANDIDATES = 250;
const DETAIL_CONCURRENCY = 4;
const DETAILS_SLEEP_MS = 200;
const HISTORY_TTL_SECONDS = 400 * 24 * 60 * 60;
const LOCK_KEY = 'newplaces:refresh:lock:v1';
const LOCK_TTL_SECONDS = 20 * 60;
const LOCK_STALE_MS = 30 * 60 * 1000;

function assertJobMode() {
  if (!process.env.JOB_MODE) {
    throw new Error('New places snapshot refresh must run with JOB_MODE=1');
  }
}

const TILE_CENTERS = [
  { name: 'cupertino', lat: 37.3229, lng: -122.0322 },
  { name: 'sunnyvale', lat: 37.3688, lng: -122.0363 },
  { name: 'santaclara', lat: 37.3516, lng: -121.9770 },
  { name: 'mountainview', lat: 37.3861, lng: -122.0839 },
  { name: 'berryessa', lat: 37.3730, lng: -121.8747 },
  { name: 'sanjose-dt', lat: 37.3337, lng: -121.8907 },
  { name: 'milpitas', lat: 37.4323, lng: -121.9066 },
  { name: 'warmsprings', lat: 37.5030, lng: -121.9383 },
];

const QUERY_SETS: Record<'chinese' | 'milk-tea', string[]> = {
  chinese: ['chinese restaurant', 'hot pot', 'skewers', 'bbq', '麻辣烫', '烤串'],
  'milk-tea': ['boba', 'bubble tea', 'milk tea', 'cheese foam', '奶茶'],
};

const SOUTH_BAY_CITIES = [
  'cupertino',
  'sunnyvale',
  'santa clara',
  'san jose',
  'milpitas',
  'fremont',
  'mountain view',
];

interface PlaceHistory {
  placeId: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  displayName?: string;
  formattedAddress?: string;
  city?: string;
  postalCode?: string;
  kinds?: Array<'chinese' | 'milk-tea'>;
  rating?: number;
  userRatingCount?: number;
  earliestReviewTime?: string;
  earliestReviewCheckedAt?: string;
  metrics?: Array<{ date: string; rating?: number; userRatingCount?: number }>;
}

interface CandidateInfo {
  placeId: string;
  kinds: Set<'chinese' | 'milk-tea'>;
  displayName?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
}

interface GatherResult {
  candidates: CandidateInfo[];
  tiles: number;
  queries: number;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function parseAddressMetadata(address?: string): { city?: string; postalCode?: string } {
  if (!address) return {};
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  let city: string | undefined;
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const part = parts[i];
    if (/\d/.test(part)) continue;
    if (/^usa$/i.test(part)) continue;
    city = part.toLowerCase();
    break;
  }
  const postalMatch = address.match(/\b\d{5}\b/);
  const postalCode = postalMatch ? postalMatch[0] : undefined;
  return { city, postalCode };
}

const SOUTH_BAY_ZIPS = new Set([
  '94002',
  '94005',
  '94010',
  '94014',
  '94015',
  '94019',
  '94022',
  '94024',
  '94035',
  '94040',
  '94041',
  '94042',
  '94043',
  '94070',
  '94074',
  '94085',
  '94086',
  '94087',
  '94089',
  '94099',
  '94112',
  '94538',
  '94539',
  '94544',
  '94608',
  '94720',
  '95002',
  '95005',
  '95008',
  '95014',
  '95030',
  '95032',
  '95033',
  '95035',
  '95036',
  '95037',
  '95050',
  '95051',
  '95052',
  '95053',
  '95054',
  '95070',
  '95110',
  '95111',
  '95112',
  '95113',
  '95116',
  '95117',
  '95118',
  '95119',
  '95120',
  '95121',
  '95122',
  '95123',
  '95124',
  '95125',
  '95126',
  '95127',
  '95128',
  '95129',
  '95130',
  '95131',
  '95132',
  '95133',
  '95134',
  '95135',
  '95136',
  '95138',
  '95139',
  '95140',
  '95148',
]);

function isSouthBayLocation(history: PlaceHistory): boolean {
  if (history.postalCode && SOUTH_BAY_ZIPS.has(history.postalCode)) {
    return true;
  }
  if (history.city) {
    return SOUTH_BAY_CITIES.some((target) => history.city?.includes(target));
  }
  return false;
}

async function getHistory(placeId: string): Promise<PlaceHistory> {
  const key = `place:history:v1:${placeId}`;
  const maybe = await kv.get<PlaceHistory>(key);
  return maybe ?? { placeId };
}

async function saveHistory(history: PlaceHistory): Promise<void> {
  const key = `place:history:v1:${history.placeId}`;
  await kv.set(key, history, { ex: HISTORY_TTL_SECONDS });
}

function addMetric(history: PlaceHistory, rating?: number, userRatingCount?: number) {
  if (rating === undefined && userRatingCount === undefined) return;
  const metrics = history.metrics ?? [];
  const today = todayDate();
  if (metrics.length > 0 && metrics[0].date === today) {
    metrics[0] = {
      date: today,
      rating: rating ?? metrics[0].rating,
      userRatingCount: userRatingCount ?? metrics[0].userRatingCount,
    };
  } else {
    metrics.unshift({ date: today, rating, userRatingCount });
    if (metrics.length > 35) metrics.pop();
  }
  history.metrics = metrics;
}

function shouldFetchDetails(history: PlaceHistory): boolean {
  const now = Date.now();
  const earliest = history.earliestReviewTime ? new Date(history.earliestReviewTime).getTime() : null;
  const checked = history.earliestReviewCheckedAt ? new Date(history.earliestReviewCheckedAt).getTime() : 0;
  if (!history.earliestReviewTime) {
    return now - checked >= 14 * 24 * 60 * 60 * 1000;
  }
  if (earliest !== null && now - earliest <= WINDOW_MS) {
    return now - checked >= 7 * 24 * 60 * 60 * 1000;
  }
  return now - checked >= 30 * 24 * 60 * 60 * 1000;
}

function computeGrowth(history: PlaceHistory): number {
  const metrics = history.metrics ?? [];
  if (metrics.length < 2) return 0;
  const latest = metrics[0].userRatingCount;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const older = [...metrics].reverse().find((entry) => new Date(entry.date).getTime() <= weekAgo);
  const earlier = older?.userRatingCount ?? metrics[metrics.length - 1].userRatingCount;
  if (latest === undefined || earlier === undefined) return 0;
  return latest - earlier;
}

function nextKinds(history: PlaceHistory, candidateKinds: Set<'chinese' | 'milk-tea'>) {
  const existing = new Set(history.kinds || []);
  for (const kind of candidateKinds) {
    existing.add(kind);
  }
  history.kinds = Array.from(existing);
}

async function gatherCandidates(): Promise<GatherResult> {
  const seen = new Map<string, CandidateInfo>();
  let queries = 0;
  for (const tile of TILE_CENTERS) {
    for (const [kind, queriesForKind] of Object.entries(QUERY_SETS)) {
      for (const textQuery of queriesForKind) {
        queries += 1;
        try {
          const response = await searchTextPlaces(textQuery, { lat: tile.lat, lng: tile.lng }, TILE_RADIUS_METERS, RESULTS_PER_QUERY);
          const places = response.places || [];
          for (const place of places) {
            if (!place.id) continue;
            if (seen.size >= MAX_CANDIDATES) break;
            const existing = seen.get(place.id);
            const kindValue = kind as 'chinese' | 'milk-tea';
            if (existing) {
              existing.kinds.add(kindValue);
            } else {
              const info: CandidateInfo = {
                placeId: place.id,
                kinds: new Set([kindValue]),
                displayName: place.displayName?.text,
                formattedAddress: place.formattedAddress,
                rating: place.rating,
                userRatingCount: place.userRatingCount,
              };
              seen.set(place.id, info);
            }
          }
        } catch (error) {
          console.error('[newplaces] gather query failed', textQuery, tile.name, error);
        }
        if (seen.size >= MAX_CANDIDATES) break;
      }
      if (seen.size >= MAX_CANDIDATES) break;
    }
    if (seen.size >= MAX_CANDIDATES) break;
  }
  return {
    candidates: Array.from(seen.values()),
    tiles: TILE_CENTERS.length,
    queries,
  };
}

function resolveKind(kinds: Set<'chinese' | 'milk-tea'>, name?: string): 'chinese' | 'milk-tea' {
  const hasMilkTeaName = name ? /tea|bubble|boba|奶茶|芋头|茶/.test(name.toLowerCase()) : false;
  if (kinds.has('milk-tea') && (hasMilkTeaName || kinds.size === 1)) return 'milk-tea';
  if (kinds.has('milk-tea') && kinds.has('chinese') && !hasMilkTeaName) return 'chinese';
  return kinds.has('milk-tea') ? 'milk-tea' : 'chinese';
}

function buildScore(entry: { history: PlaceHistory; kind: 'chinese' | 'milk-tea'; firstSeenAt?: string }): { score: number; why: string[] } {
  const now = Date.now();
  const history = entry.history;
  const scoreReasons: string[] = [];
  let score = 0;
  const earliestMs = history.earliestReviewTime ? new Date(history.earliestReviewTime).getTime() : null;
  if (earliestMs && now - earliestMs <= WINDOW_MS) {
    score += 2;
    scoreReasons.push('review-within-180d');
  }
  if (entry.firstSeenAt) {
    const firstSeenMs = new Date(entry.firstSeenAt).getTime();
    if (now - firstSeenMs <= 90 * 24 * 60 * 60 * 1000) {
      score += 1;
      scoreReasons.push('first-seen-within-90d');
    }
  }
  const growth = computeGrowth(history);
  if (growth >= 10) {
    score += 1;
    scoreReasons.push('growth-7d>=10');
  }
  if ((history.rating ?? 0) >= 4.3) {
    score += 0.5;
    scoreReasons.push('high-rating');
  }
  const userCount = history.userRatingCount ?? 0;
  if (userCount > 800) {
    score -= 1;
    scoreReasons.push('high-rating-count');
  }
  // Outside-of-South-Bay entries are filtered earlier, so no penalty needed
  return { score, why: scoreReasons };
}

async function updateHistoryWithDetails(history: PlaceHistory, detail: PlaceDetailsResponse) {
  if (detail.displayName?.text) history.displayName = detail.displayName.text;
  if (detail.formattedAddress) {
    history.formattedAddress = detail.formattedAddress;
    const { city, postalCode } = parseAddressMetadata(detail.formattedAddress);
    if (city) history.city = city;
    if (postalCode) history.postalCode = postalCode;
  }
  if (detail.rating !== undefined) history.rating = detail.rating;
  if (detail.userRatingCount !== undefined) history.userRatingCount = detail.userRatingCount;
  const earliest = normalizeReviewTime(detail.reviews);
  if (earliest) {
    if (!history.earliestReviewTime || new Date(earliest) < new Date(history.earliestReviewTime)) {
      history.earliestReviewTime = earliest;
    }
    history.earliestReviewCheckedAt = new Date().toISOString();
  } else {
    history.earliestReviewCheckedAt = new Date().toISOString();
  }
}

function normalizeReviewTime(reviews: PlaceHistory['metrics'] | undefined | Array<{ publishTime?: string }>): string | null {
  if (!reviews || reviews.length === 0) return null;
  const times = reviews
    .map((review: any) => review.publishTime || review.date)
    .filter((time): time is string => !!time)
    .map((time) => new Date(time).getTime())
    .filter((ms) => !Number.isNaN(ms));
  if (times.length === 0) return null;
  return new Date(Math.min(...times)).toISOString();
}

async function processCandidate(candidate: CandidateInfo): Promise<NewPlaceEntry | null> {
  const nowIso = new Date().toISOString();
  const now = Date.now();
  const history = await getHistory(candidate.placeId);
  if (!history.firstSeenAt) {
    history.firstSeenAt = nowIso;
  }
  history.lastSeenAt = nowIso;
  nextKinds(history, candidate.kinds);
  if (candidate.displayName) history.displayName = candidate.displayName;
  if (candidate.formattedAddress) {
    history.formattedAddress = candidate.formattedAddress;
    const { city, postalCode } = parseAddressMetadata(candidate.formattedAddress);
    if (city) history.city = city;
    if (postalCode) history.postalCode = postalCode;
  }
  if (candidate.rating !== undefined) history.rating = candidate.rating;
  if (candidate.userRatingCount !== undefined) history.userRatingCount = candidate.userRatingCount;
  addMetric(history, candidate.rating, candidate.userRatingCount);
  const firstSeenMs = history.firstSeenAt ? new Date(history.firstSeenAt).getTime() : null;
  const qualifiesForDetail =
    (history.userRatingCount ?? 0) <= 400 ||
    (firstSeenMs !== null && now - firstSeenMs <= 220 * 24 * 60 * 60 * 1000);
  if (qualifiesForDetail && shouldFetchDetails(history)) {
    try {
      const detail = await fetchPlaceDetails(candidate.placeId);
      await updateHistoryWithDetails(history, detail as any);
      if (detail.userRatingCount !== undefined) history.userRatingCount = detail.userRatingCount;
      if (detail.rating !== undefined) history.rating = detail.rating;
      addMetric(history, detail.rating, detail.userRatingCount);
    } catch (error) {
      console.error('[newplaces] detail failed', candidate.placeId, error);
    }
  }
  await saveHistory(history);
  const earliestTime = history.earliestReviewTime;
  const earliestMs = earliestTime ? new Date(earliestTime).getTime() : null;
  const firstSeenMsFinal = history.firstSeenAt ? new Date(history.firstSeenAt).getTime() : null;
  const isNew = earliestMs !== null && now - earliestMs <= WINDOW_MS;
  const possibleNew =
    !isNew &&
    firstSeenMsFinal !== null &&
    now - firstSeenMsFinal <= 60 * 24 * 60 * 60 * 1000 &&
    (history.userRatingCount ?? 0) <= 120;
  if (!isNew && !possibleNew) {
    return null;
  }

  if (!isSouthBayLocation(history)) {
    return null;
  }
  const kind = resolveKind(history.kinds ? new Set(history.kinds) : new Set(candidate.kinds), history.displayName);
  const { score, why } = buildScore({ history, kind, firstSeenAt: history.firstSeenAt });
  return {
    placeId: candidate.placeId,
    displayName: history.displayName || candidate.displayName || 'Unknown',
    city: history.city,
    formattedAddress: history.formattedAddress,
    kind,
    rating: history.rating,
    userRatingCount: history.userRatingCount,
    earliestReviewTime: history.earliestReviewTime,
    firstSeenAt: history.firstSeenAt,
    score,
    why: why.length ? why : ['qualifies'],
  };
}

async function buildSnapshot(): Promise<NewPlacesSnapshot> {
  const gather = await gatherCandidates();
  const entries: NewPlaceEntry[] = [];
  const chunks: CandidateInfo[][] = [];
  for (let i = 0; i < gather.candidates.length; i += DETAIL_CONCURRENCY) {
    chunks.push(gather.candidates.slice(i, i + DETAIL_CONCURRENCY));
  }
  for (const [index, chunk] of chunks.entries()) {
    const results = await Promise.all(chunk.map((candidate: CandidateInfo) => processCandidate(candidate)));
    entries.push(...results.filter((entry): entry is NewPlaceEntry => Boolean(entry)));
    if (index < chunks.length - 1) {
      await sleep(DETAILS_SLEEP_MS);
    }
  }
  const sorted = entries
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.earliestReviewTime ? new Date(a.earliestReviewTime).getTime() : 0;
      const bTime = b.earliestReviewTime ? new Date(b.earliestReviewTime).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 20);
  return {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    tiles: gather.tiles,
    queries: gather.queries,
    candidates: gather.candidates.length,
    places: sorted,
  };
}

interface LockRecord {
  runId: string;
  startedAt: string;
  tookOver: boolean;
}

function buildLockPayload(runId: string, startedAt: string) {
  return JSON.stringify({ runId, startedAt });
}

async function acquireLock(): Promise<LockRecord | null> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const payload = buildLockPayload(runId, startedAt);
  let ok = await kv.set(LOCK_KEY, payload, { nx: true, ex: LOCK_TTL_SECONDS });
  if (ok) {
    console.log(`[newplaces] lock ${LOCK_KEY} acquired runId=${runId}`);
    return { runId, startedAt, tookOver: false };
  }

  const existing = await kv.get<string>(LOCK_KEY);
  if (existing) {
    try {
      const parsed: { runId?: string; startedAt?: string } = JSON.parse(existing);
      const openedAt = parsed.startedAt ? new Date(parsed.startedAt).getTime() : 0;
      const age = Date.now() - openedAt;
      if (openedAt > 0 && age > LOCK_STALE_MS) {
        console.log(`[newplaces] stale lock detected runId=${parsed.runId || 'unknown'} age=${Math.floor(age / 1000)}s, taking over`);
        await kv.del(LOCK_KEY);
        ok = await kv.set(LOCK_KEY, payload, { nx: true, ex: LOCK_TTL_SECONDS });
        if (ok) {
          console.log(`[newplaces] lock ${LOCK_KEY} takeover runId=${runId}`);
          return { runId, startedAt, tookOver: true };
        }
      }
    } catch {
      // ignore parsing errors and fall through
    }
  }

  return null;
}

async function releaseLock(runId: string) {
  try {
    const current = await kv.get<string>(LOCK_KEY);
    if (!current) return;
    const parsed: { runId?: string } = JSON.parse(current);
    if (parsed.runId === runId) {
      await kv.del(LOCK_KEY);
      console.log(`[newplaces] lock ${LOCK_KEY} released runId=${runId}`);
    }
  } catch (error) {
    console.error('[newplaces] failed to release lock', error);
  }
}

export async function refreshNewPlacesSnapshot(): Promise<NewPlacesSnapshot> {
  assertJobMode();
  const lock = await acquireLock();
  if (!lock) {
    throw new Error('refresh_in_progress');
  }
  try {
    const snapshot = await buildSnapshot();
    await kv.set(SNAPSHOT_KEY, snapshot, { ex: SNAPSHOT_TTL_SECONDS });
    return snapshot;
  } finally {
    await releaseLock(lock.runId);
  }
}
