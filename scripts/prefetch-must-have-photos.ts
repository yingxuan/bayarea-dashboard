/**
 * Prefetch photos for must-have places.
 * Usage: pnpm tsx scripts/prefetch-must-have-photos.ts
 *
 * Reads must-have lists under client/src/lib/seeds/southbay/_musthave/*.json,
 * resolves place_id from seed files, and calls ensurePlacePhoto(place_id, 'prefetch').
 */

import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { ensurePlacePhoto } from '../lib/spend/ensurePlacePhoto.js';

type SeedPlace = {
  placeId?: string;
  name: string;
};

function loadJson<T>(p: string): T {
  const raw = readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function buildSeedIndex(): Map<string, string> {
  const categories = ['奶茶', '中餐', '夜宵', '新店打卡'];
  const base = path.join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
  const index = new Map<string, string>();
  categories.forEach((cat) => {
    const file = path.join(base, `${cat}.json`);
    const data = loadJson<{ items: SeedPlace[] }>(file);
    (data.items || []).forEach((item) => {
      if (item.placeId) {
        index.set(item.name.toLowerCase(), item.placeId);
      }
    });
  });
  return index;
}

async function main() {
  const mustHaveDir = path.join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay', '_musthave');
  const files = readdirSync(mustHaveDir).filter((f) => f.endsWith('.json'));
  const seedIndex = buildSeedIndex();

  const placeIds: string[] = [];
  for (const file of files) {
    const data = loadJson<Array<{ name: string }>>(path.join(mustHaveDir, file));
    data.forEach((item) => {
      const pid = seedIndex.get(item.name.toLowerCase());
      if (pid) {
        placeIds.push(pid);
      } else {
        console.warn(`[prefetch] placeId not found in seeds for "${item.name}" from ${file}`);
      }
    });
  }

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
