/**
 * Prefetch photos for must-have places.
 * Usage: pnpm tsx scripts/prefetch-must-have-photos.ts
 *
 * Reads must-have lists under client/src/lib/seeds/southbay/_musthave/*.json,
 * resolves place_id from seed files, and calls ensurePlacePhoto(place_id, 'prefetch').
 */

import { readFileSync } from 'fs';
import path from 'path';
import { ensurePlacePhoto } from '../lib/spend/ensurePlacePhoto.js';

type CanonicalPayload = {
  places?: Array<{ place_id?: string; disabled?: boolean }>;
};

function loadJson<T>(p: string): T {
  const raw = readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function loadCanonicalPlaceIds(): string[] {
  const p = path.join(process.cwd(), 'data', 'spend', 'musthave.placeids.json');
  try {
    const data = loadJson<CanonicalPayload>(p);
    return (data.places || [])
      .filter((entry) => entry.place_id && !entry.disabled)
      .map((entry) => entry.place_id as string);
  } catch (err) {
    console.warn('[prefetch] could not load musthave.placeids.json', err);
    return [];
  }
}

async function main() {
  const placeIds = loadCanonicalPlaceIds();

  const unique = Array.from(new Set(placeIds));
  console.log(`[prefetch] must-have place_ids: ${unique.length}`);

  let hits = 0;
  let misses = 0;
  let failed = 0;

  const concurrency = 3;
  const queue = [...unique];

  const worker = async () => {
    while (queue.length > 0) {
      const pid = queue.shift();
      if (!pid) break;
      try {
        const res = await ensurePlacePhoto(pid, 'prefetch');
        if (res.status === 'hit') hits += 1;
        else if (res.status === 'miss') misses += 1;
        else failed += 1;
        console.log(`[prefetch] ${pid} -> ${res.status} ${res.photo_local_url || ''}`);
      } catch (error) {
        failed += 1;
        console.error(`[prefetch] ${pid} failed`, error);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`[prefetch] done. hit=${hits}, miss=${misses}, failed=${failed}, total=${unique.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
