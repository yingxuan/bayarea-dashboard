/**
 * Generate all seed files from CSV inputs
 * Handles UTF-8 encoding properly
 * Implements canonical key deduplication
 */

import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');

// Brand variant normalization mapping
const BRAND_VARIANTS: Record<string, string> = {
  'coco fresh tea & juice': 'coco',
  'coco fresh tea and juice': 'coco',
  '85c bakery cafe': '85c',
  '85c': '85c',
  'tpumps': 'tpumps',
};

/**
 * Normalize name for canonical key
 */
function normalizeName(name: string): string {
  let normalized = name.trim().toLowerCase();
  
  // Replace & with "and"
  normalized = normalized.replace(/&/g, 'and');
  
  // Remove punctuation: .,''"()-
  normalized = normalized.replace(/[.,'’"()\-]/g, '');
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Apply brand variant normalization
  const lower = normalized.toLowerCase();
  for (const [variant, canonical] of Object.entries(BRAND_VARIANTS)) {
    if (lower.includes(variant) || lower === variant) {
      normalized = canonical;
      break;
    }
  }
  
  return normalized;
}

/**
 * Normalize city for canonical key
 */
function normalizeCity(city: string): string {
  let normalized = city.trim().toLowerCase();
  
  // Normalize "san jose" vs "sanjose"
  if (normalized === 'sanjose' || normalized === 'san jose') {
    normalized = 'san jose';
  }
  
  return normalized;
}

/**
 * Generate canonical key for deduplication
 */
function getCanonicalKey(name: string, city: string): string {
  return `${normalizeName(name)}|${normalizeCity(city)}`;
}

function generateSearchUrl(name: string, city: string): string {
  const query = `${name} ${city} CA`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function parseCSV(content: string): SeedPlace[] {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const seeds: SeedPlace[] = [];

  // Skip header
  let startIndex = 0;
  if (lines[0]?.toLowerCase().includes('category') || lines[0]?.toLowerCase().includes('name')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;

    const [category, name, city, ...tagParts] = parts;
    const tags = tagParts.length > 0 ? tagParts.join(',').split(',').map((t) => t.trim()) : undefined;

    if (!name || !city) continue;

    const query = `${name} ${city} CA`;
    seeds.push({
      name,
      city,
      mapsUrl: generateSearchUrl(name, city),
      mapsType: 'search',
      query,
      categoryTags: tags,
    });
  }

  return seeds;
}

function normalizeMapsUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname === '/maps/search/' || urlObj.pathname === '/maps') {
      const query = urlObj.searchParams.get('query') || urlObj.searchParams.get('q');
      if (query) {
        const normalizedQuery = decodeURIComponent(query).trim();
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedQuery)}`;
      }
    }
    if (urlObj.pathname.startsWith('/maps/place/')) {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Score a seed for deduplication preference (higher = better)
 */
function scoreSeed(seed: SeedPlace): number {
  let score = 0;
  
  // Prefer place over search
  if (seed.mapsType === 'place') score += 100;
  else if (seed.mapsType === 'search') score += 10;
  
  // Prefer entries with address
  if (seed.address && seed.address.trim().length > 0) score += 50;
  
  // Prefer entries with placeId
  if (seed.placeId && seed.placeId.trim().length > 0) score += 30;
  
  return score;
}

function generateSeedFile(category: '奶茶' | '中餐' | '夜宵' | '新店打卡', csvFile: string) {
  const csvPath = join(SEEDS_DIR, '_inputs', csvFile);
  const content = readFileSync(csvPath, 'utf-8');
  const seeds = parseCSV(content);

  // Deduplicate by canonical key
  // Map: canonicalKey -> { seed, index, score }
  const seenByCanonical = new Map<string, { seed: SeedPlace; index: number; score: number }>();
  const duplicates: Array<{ canonicalKey: string; kept: SeedPlace; removed: SeedPlace[] }> = [];
  
  seeds.forEach((seed, index) => {
    const canonicalKey = getCanonicalKey(seed.name, seed.city);
    const score = scoreSeed(seed);
    
    const existing = seenByCanonical.get(canonicalKey);
    
    if (!existing) {
      // First occurrence - keep it
      seenByCanonical.set(canonicalKey, { seed, index, score });
    } else {
      // Duplicate found - decide which to keep
      if (score > existing.score) {
        // New one is better - replace
        const removed = existing.seed;
        seenByCanonical.set(canonicalKey, { seed, index, score });
        
        // Track duplicate
        const dupEntry = duplicates.find(d => d.canonicalKey === canonicalKey);
        if (dupEntry) {
          dupEntry.kept = seed;
          dupEntry.removed.push(removed);
        } else {
          duplicates.push({
            canonicalKey,
            kept: seed,
            removed: [removed],
          });
        }
      } else {
        // Existing one is better - keep it, discard new one
        const dupEntry = duplicates.find(d => d.canonicalKey === canonicalKey);
        if (dupEntry) {
          dupEntry.removed.push(seed);
        } else {
          duplicates.push({
            canonicalKey,
            kept: existing.seed,
            removed: [seed],
          });
        }
      }
    }
  });

  const deduped = Array.from(seenByCanonical.values()).map(v => v.seed);

  // Log deduplication report
  if (duplicates.length > 0) {
    console.log(`\n📊 ${category} - Deduplication Report:`);
    console.log(`   Total input: ${seeds.length}`);
    console.log(`   After dedup: ${deduped.length}`);
    console.log(`   Duplicates found: ${duplicates.length}`);
    if (duplicates.length <= 10) {
      duplicates.forEach(({ canonicalKey, kept, removed }) => {
        console.log(`   - "${canonicalKey}": kept "${kept.name}" (${kept.city}), removed ${removed.length} duplicate(s)`);
      });
    } else {
      console.log(`   (showing first 10 of ${duplicates.length} duplicates)`);
      duplicates.slice(0, 10).forEach(({ canonicalKey, kept, removed }) => {
        console.log(`   - "${canonicalKey}": kept "${kept.name}" (${kept.city}), removed ${removed.length} duplicate(s)`);
      });
    }
  }

  const seedFile: SeedFile = {
    version: 1,
    category,
    region: 'southbay',
    updatedAt: new Date().toISOString(),
    items: deduped,
  };

  // Write with explicit UTF-8
  const outputPath = join(SEEDS_DIR, `${category}.json`);
  writeFileSync(outputPath, JSON.stringify(seedFile, null, 2), 'utf8');

  console.log(`✅ ${category}: ${deduped.length} items (${seeds.length - deduped.length} duplicates removed)`);
}

function main() {
  console.log('🌱 Generating all seed files...\n');

  generateSeedFile('奶茶', 'bubble-tea.csv');
  generateSeedFile('中餐', 'chinese.csv');
  generateSeedFile('夜宵', 'late-night.csv');
  generateSeedFile('新店打卡', 'new-ish.csv');

  console.log('\n🔍 Run validator:');
  console.log('   npx tsx scripts/validate-seeds.ts\n');
}

main();
