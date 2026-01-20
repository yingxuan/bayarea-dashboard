/**
 * Validate must-have place lists against Google Places Text Search + Details.
 *
 * Usage: pnpm tsx scripts/validate-musthave-places.ts
 *
 * Inputs (if present):
 *   data/spend/中餐.musthave.json
 *   data/spend/夜宵.musthave.json
 *   data/spend/奶茶.musthave.json
 *   data/spend/新店打卡.musthave.json
 *
 * Outputs:
 *   data/spend/_validated/<category>.musthave.json
 *   data/spend/_validated/summary.json
 */

import fs from 'fs';
import path from 'path';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_PLACES_API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY is required');
  process.exit(1);
}

const INPUT_DIR = path.join(process.cwd(), 'data', 'spend');
const OUTPUT_DIR = path.join(INPUT_DIR, '_validated');
const CATEGORIES = ['中餐', '夜宵', '奶茶', '新店打卡'];
const SLEEP_MS = 250;

type MustHaveEntry = {
  name: string;
  city: string;
  tags?: string[];
  addressHint?: string;
  disabled?: boolean;
  disabledReason?: string;
};

type ValidatedEntry = MustHaveEntry & {
  place_id?: string;
  validation?: {
    resolvedName?: string;
    resolvedAddress?: string;
    userRatingCount?: number;
    rating?: number;
  };
};

type SearchPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
  businessStatus?: string;
  userRatingCount?: number;
  rating?: number;
  types?: string[];
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

function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.9;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const tokensA = new Set(na.split(' '));
  const tokensB = new Set(nb.split(' '));
  const overlap = [...tokensA].filter((t) => tokensB.has(t)).length;
  const denom = Math.max(tokensA.size, tokensB.size, 1);
  return overlap / denom;
}

function cityMatches(expectedCity: string, candidate: SearchPlace): boolean {
  const cityNorm = normalize(expectedCity);
  if (candidate.formattedAddress && normalize(candidate.formattedAddress).includes(cityNorm)) return true;
  for (const comp of candidate.addressComponents || []) {
    if (!comp.longText) continue;
    if ((comp.types || []).some((t) => ['locality', 'postal_town', 'administrative_area_level_3'].includes(t))) {
      if (normalize(comp.longText).includes(cityNorm)) return true;
    }
  }
  return false;
}

function businessOpen(status?: string): boolean {
  if (!status) return true;
  return !status.toLowerCase().includes('closed');
}

async function textSearch(query: string): Promise<SearchPlace[]> {
  const url = `${'https://places.googleapis.com/v1/places:searchText'}`;
  const body = {
    textQuery: query,
    maxResultCount: 3,
  };
  const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus,places.userRatingCount,places.rating,places.types';
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
  return data.places || [];
}

async function pickBest(entry: MustHaveEntry, candidates: SearchPlace[]): Promise<{ best: SearchPlace | null; reason?: string }> {
  let best: SearchPlace | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (!c.id || !c.displayName?.text) continue;
    if (!businessOpen(c.businessStatus)) continue;
    if (!cityMatches(entry.city, c)) continue;
    const score = nameSimilarity(entry.name, c.displayName.text);
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

async function validateEntry(entry: MustHaveEntry): Promise<{ result: 'KEEP' | 'FIX' | 'DISABLE'; validated: ValidatedEntry; reason?: string }> {
  const query = `${entry.name} ${entry.addressHint || ''} ${entry.city}`.trim();
  try {
    const candidates = await textSearch(query);
    await sleep(SLEEP_MS);
    const { best, reason } = await pickBest(entry, candidates);
    if (!best) {
      return {
        result: 'DISABLE',
        validated: { ...entry, disabled: true, disabledReason: reason || 'no_match' },
        reason: reason || 'no_match',
      };
    }
    const name = best.displayName?.text || '';
    const addr = best.formattedAddress || '';
    const cityOk = cityMatches(entry.city, best);
    const nameScore = nameSimilarity(entry.name, name);
    const action: 'KEEP' | 'FIX' = cityOk && nameScore >= 0.6 ? 'KEEP' : 'FIX';
    const validation = {
      resolvedName: name,
      resolvedAddress: addr,
      userRatingCount: best.userRatingCount,
      rating: best.rating,
    };
    const validated: ValidatedEntry = { ...entry, place_id: best.id, validation };
    return { result: action, validated, reason: action === 'KEEP' ? 'ok' : 'mismatch_maybe_fix_city_or_name' };
  } catch (err: any) {
    return {
      result: 'DISABLE',
      validated: { ...entry, disabled: true, disabledReason: `api_error:${err?.message || 'unknown'}` },
      reason: err?.message || 'api_error',
    };
  }
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function loadEntries(category: string): MustHaveEntry[] {
  const file = path.join(INPUT_DIR, `${category}.musthave.json`);
  if (!fs.existsSync(file)) {
    console.warn(`[validate] missing file ${file}, skipping`);
    return [];
  }
  const raw = fs.readFileSync(file, 'utf-8');
  try {
    return JSON.parse(raw) as MustHaveEntry[];
  } catch (err) {
    console.warn(`[validate] failed to parse ${file}`, err);
    return [];
  }
}

async function main() {
  ensureOutputDir();
  const summary: Record<string, { kept: number; fixed: number; disabled: number }> = {};
  for (const category of CATEGORIES) {
    const entries = loadEntries(category);
    const validatedList: ValidatedEntry[] = [];
    let kept = 0;
    let fixed = 0;
    let disabled = 0;
    for (const entry of entries) {
      const { result, validated, reason } = await validateEntry(entry);
      if (result === 'KEEP') kept++;
      else if (result === 'FIX') fixed++;
      else disabled++;
      console.log(`[${category}] ${entry.name} (${entry.city}) -> ${result} ${validated.place_id || ''} reason=${reason || ''}`);
      validatedList.push(validated);
    }
    const outPath = path.join(OUTPUT_DIR, `${category}.musthave.json`);
    fs.writeFileSync(outPath, JSON.stringify(validatedList, null, 2), 'utf-8');
    summary[category] = { kept, fixed, disabled };
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log('done', summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
