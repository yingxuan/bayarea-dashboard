/**
 * Generate canonical place_id table for must-have lists.
 *
 * Usage: pnpm tsx scripts/generate-musthave-placeids.ts
 *
 * Inputs:
 *   data/spend/中餐.musthave.json
 *   data/spend/夜宵.musthave.json
 *   data/spend/奶茶.musthave.json
 *   data/spend/新店打卡.musthave.json
 *
 * Outputs:
 *   data/spend/musthave.placeids.json
 *   data/spend/musthave.placeids.report.md
 */

import fs from 'fs';
import path from 'path';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_PLACES_API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY required');
  process.exit(1);
}

const INPUT_FILES = [
  'data/spend/中餐.musthave.json',
  'data/spend/夜宵.musthave.json',
  'data/spend/奶茶.musthave.json',
  'data/spend/新店打卡.musthave.json',
];
const OUTPUT_FILE = 'data/spend/musthave.placeids.json';
const REPORT_FILE = 'data/spend/musthave.placeids.report.md';
const SLEEP_MS = 250;
const NAME_ALIASES: Record<string, string[]> = {
  'shuyi tealicious': ['shuyi', 'grass jelly', 'tealicious', 'shuyi grass jelly', 'shuyi grass jelly & tea'],
  'wanpo tea shop': ['wanpo', 'wanpo tea'],
  'ume tea': ['ume', 'ume tea'],
  'chicha san chen': ['chicha', 'chicha sanchen', 'san chen'],
  'heytea': ['hey tea', 'heytea'],
  'wow tea': ['wowtea', 'wow tea drink'],
  "chef yang's bbq": ['chef yang', 'yang', 'yangs bbq'],
  'tan suo': ['tansuo', 'tan suo bbq'],
  'phoenix bbq': ['huo feng huang', 'phoenix barbecue', 'phoenix bbq'],
  'fat ni bbq': ['fat ni', 'pang ni', 'fatni'],
  'bbq king': ['kao wang', 'bbq king'],
  xiyue: ['xiyue', 'xi yu', 'xiyu', 'xiyue niuyang', 'xi yue'],
  'old river': ['old river', 'lao he dao', 'laohedao'],
};

type Entry = {
  name: string;
  city: string;
  tags?: string[];
  addressHint?: string;
};

type Candidate = {
  id?: string;
  place_id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  userRatingCount?: number;
  rating?: number;
  types?: string[];
};

type OutputPlace = {
  key: string;
  name: string;
  city: string;
  tags?: string[];
  addressHint?: string;
  place_id: string;
  resolved: {
    displayName?: string;
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
  };
};

type DisabledEntry = {
  name: string;
  city: string;
  tags?: string[];
  addressHint?: string;
  reason: string;
  candidates: Array<{
    place_id?: string;
    displayName?: string;
    formattedAddress?: string;
    userRatingCount?: number;
  }>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(name: string, city: string, addressHint?: string): string {
  const parts = [name, city, addressHint || '']
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  return parts.join('-');
}

function nameSimilarity(input: string, candidate: string): number {
  const a = normalize(input);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  const aliases = NAME_ALIASES[a] || [];
  const compare = (x: string, y: string) => {
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.startsWith(y) || y.startsWith(x)) return 0.9;
    if (x.includes(y) || y.includes(x)) return 0.8;
    const tokensA = new Set(x.split(' '));
    const tokensB = new Set(y.split(' '));
    const overlap = [...tokensA].filter((t) => tokensB.has(t)).length;
    const denom = Math.max(tokensA.size, tokensB.size, 1);
    return overlap / denom;
  };
  let score = compare(a, b);
  for (const alias of aliases) {
    const s = compare(normalize(alias), b);
    if (s > score) score = s;
  }
  return score;
}

function cityMatches(expectedCity: string, candidate: Candidate): boolean {
  const cityNorm = normalize(expectedCity);
  if (candidate.formattedAddress && normalize(candidate.formattedAddress).includes(cityNorm)) return true;
  return false;
}

function businessOpen(status?: string): boolean {
  if (!status) return true;
  return !status.toLowerCase().includes('closed');
}

function loadEntries(): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const file of INPUT_FILES) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf-8');
    try {
      const arr = JSON.parse(raw) as Entry[];
      arr.forEach((e) => {
        const key = `${e.name}__${e.city}__${e.addressHint || ''}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push(e);
        }
      });
    } catch (err) {
      console.warn(`[generate] failed to parse ${file}`, err);
    }
  }
  return entries;
}

async function searchText(entry: Entry): Promise<Candidate[]> {
  const query = `${entry.name} ${entry.addressHint || ''} ${entry.city}`.trim();
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = { textQuery: query, maxResultCount: 3 };
  const fieldMask =
    'places.id,places.displayName,places.formattedAddress,places.businessStatus,places.userRatingCount,places.rating,places.types';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`searchText ${resp.status} ${txt}`);
  }
  const data = await resp.json();
  return (data.places || []) as Candidate[];
}

function pickBest(entry: Entry, candidates: Candidate[]): { best: Candidate | null; reason?: string } {
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const pid = c.place_id || c.id;
    c.place_id = pid;
    if (!pid) continue;
    if (!businessOpen(c.businessStatus)) continue;
    if (!cityMatches(entry.city, c)) continue;
    const score = nameSimilarity(entry.name, c.displayName?.text || (c.displayName as any) || '');
    if (score > bestScore) {
      bestScore = score;
      best = c;
    } else if (score === bestScore && best && (c.userRatingCount || 0) > (best.userRatingCount || 0)) {
      best = c;
    }
  }
  if (!best) return { best: null, reason: 'no_city_match_or_closed' };
  if (bestScore < 0.4) return { best: null, reason: 'name_ambiguous' };
  return { best, reason: undefined };
}

async function main() {
  const entries = loadEntries();
  const places: OutputPlace[] = [];
  const disabled: DisabledEntry[] = [];

  for (const entry of entries) {
    try {
      const candidates = await searchText(entry);
      await sleep(SLEEP_MS);
      const { best, reason } = pickBest(entry, candidates);
      if (!best || !best.place_id) {
        disabled.push({
          ...entry,
          reason: reason || 'no_match',
          candidates: (candidates || []).map((c) => ({
            place_id: c.place_id || c.id,
            displayName: c.displayName?.text || (c.displayName as any),
            formattedAddress: c.formattedAddress,
            userRatingCount: c.userRatingCount,
          })),
        });
        continue;
      }
      places.push({
        key: slugify(entry.name, entry.city, entry.addressHint),
        name: entry.name,
        city: entry.city,
        tags: entry.tags,
        addressHint: entry.addressHint,
        place_id: best.place_id,
        resolved: {
          displayName: best.displayName?.text || (best.displayName as any),
          formattedAddress: best.formattedAddress,
          rating: best.rating,
          userRatingCount: best.userRatingCount,
        },
      });
    } catch (err: any) {
      disabled.push({
        ...entry,
        reason: `api_error:${err?.message || 'unknown'}`,
        candidates: [],
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    places,
    disabled,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  const reportLines: string[] = [];
  reportLines.push(`# Must-have place_id generation report`);
  reportLines.push(`Generated: ${output.generatedAt}`);
  reportLines.push('');
  reportLines.push(`Kept/Resolved: ${places.length}`);
  reportLines.push(`Disabled: ${disabled.length}`);
  reportLines.push('');
  reportLines.push(`## Places`);
  places.forEach((p) => {
    reportLines.push(`- ${p.name} (${p.city}) -> ${p.place_id} | ${p.resolved.displayName || ''} | ${p.resolved.formattedAddress || ''}`);
  });
  reportLines.push('');
  reportLines.push(`## Disabled`);
  disabled.forEach((d) => {
    reportLines.push(`- ${d.name} (${d.city}) reason=${d.reason}`);
  });
  fs.writeFileSync(REPORT_FILE, reportLines.join('\n'), 'utf-8');

  console.log(`done places=${places.length} disabled=${disabled.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
