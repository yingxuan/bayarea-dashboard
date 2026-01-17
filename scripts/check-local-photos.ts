/**
 * Quick verification for local place photos.
 * Usage: pnpm tsx scripts/check-local-photos.ts
 *
 * - Fetches /api/spend/today (GET) and /api/spend/new-places?manual_refresh=1 (POST)
 * - Verifies photo_local_url when the local index has entries for the place_id.
 * - Reports duplicate photo_local_url usage across different place_ids.
 */

import { readFileSync } from 'fs';
import path from 'path';

type Place = {
  id?: string;
  placeId?: string;
  photo_local_url?: string;
  name?: string;
};

type PhotoIndex = Record<string, string[]>;

const BASE_URL = process.env.PHOTO_CHECK_BASE || 'http://localhost:3000';
const INDEX_PATH = path.join(process.cwd(), 'data', 'place_photos', 'index.v1.json');

function loadIndex(): PhotoIndex {
  try {
    const raw = readFileSync(INDEX_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn(`[photo-check] Could not load index at ${INDEX_PATH}:`, (error as Error).message);
    return {};
  }
}

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, json: null, text };
  }
}

function extractPlacesFromToday(payload: any): Place[] {
  if (!payload) return [];
  const itemsByCategory = payload.itemsByCategory || {};
  const flat = Object.values(itemsByCategory).flat() as Place[];
  if (flat.length > 0) return flat;
  return (payload.items as Place[]) || [];
}

function extractPlacesFromNew(payload: any): Place[] {
  if (!payload) return [];
  return (payload.items as Place[]) || [];
}

function analyzePlaces(label: string, places: Place[], index: PhotoIndex) {
  const sampled = places.slice(0, 20);
  const dupMap = new Map<string, string[]>();
  let hits = 0;
  let misses = 0;

  for (const p of sampled) {
    const placeId = p.id || p.placeId;
    if (!placeId) continue;
    const indexHas = Array.isArray(index[placeId]) && index[placeId].length > 0;
    const localUrl = p.photo_local_url;
    if (indexHas && localUrl && localUrl.startsWith('/')) {
      hits += 1;
    } else if (indexHas) {
      misses += 1;
    }
    if (localUrl) {
      const arr = dupMap.get(localUrl) || [];
      arr.push(placeId);
      dupMap.set(localUrl, arr);
    }
  }

  const duplicates = Array.from(dupMap.entries()).filter(([, ids]) => ids.length > 1);

  console.log(`[photo-check] ${label}: total=${places.length}, sampled=${sampled.length}, indexHits=${hits}, indexMisses=${misses}, duplicates=${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log(`[photo-check] ${label} duplicate photo_local_url entries:`);
    duplicates.slice(0, 5).forEach(([url, ids]) => {
      console.log(`  ${url} -> ${ids.join(', ')}`);
    });
  }
}

async function main() {
  const index = loadIndex();

  // /api/spend/today
  try {
    const todayUrl = `${BASE_URL}/api/spend/today`;
    const todayRes = await fetchJson(todayUrl);
    if (!todayRes.ok || !todayRes.json) {
      console.warn(`[photo-check] Skip /api/spend/today (status ${todayRes.status})`);
    } else {
      const places = extractPlacesFromToday(todayRes.json);
      analyzePlaces('today', places, index);
    }
  } catch (error) {
    console.warn('[photo-check] Error fetching /api/spend/today:', (error as Error).message);
  }

  // /api/spend/new-places
  try {
    const newUrl = `${BASE_URL}/api/spend/new-places?manual_refresh=1`;
    const newRes = await fetchJson(newUrl, { method: 'POST' });
    if (!newRes.ok || !newRes.json) {
      console.warn(`[photo-check] Skip /api/spend/new-places (status ${newRes.status})`);
    } else {
      const places = extractPlacesFromNew(newRes.json);
      analyzePlaces('new-places', places, index);
    }
  } catch (error) {
    console.warn('[photo-check] Error fetching /api/spend/new-places:', (error as Error).message);
  }
}

main();
