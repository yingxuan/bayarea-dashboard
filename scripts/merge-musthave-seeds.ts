/**
 * Merge must-have seed files into final seed pools
 * 
 * Rules:
 * - Must-have items ALWAYS win in conflicts (same canonicalKey)
 * - No duplicate canonicalKey allowed in final seed file
 * - Priority: must-have > placeId > mapsType="place" > addressHint > first occurrence
 * - Merge tags (union)
 * 
 * Usage: npx tsx scripts/merge-musthave-seeds.ts
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace, SeedCategory } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const MUSTHAVE_DIR = join(SEEDS_DIR, '_musthave');

// Brand variant normalization mapping (must match generate-all-seeds.ts)
const BRAND_VARIANTS: Record<string, string> = {
  'coco fresh tea & juice': 'coco',
  'coco fresh tea and juice': 'coco',
  '85c bakery cafe': '85c',
  '85c': '85c',
  'tpumps': 'tpumps',
};

/**
 * Normalize name for canonical key (must match generate-all-seeds.ts)
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
 * Normalize city for canonical key (must match generate-all-seeds.ts)
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

/**
 * Generate search URL for a place (if mapsUrl not provided)
 */
function generateSearchUrl(name: string, city: string, addressHint?: string): string {
  let query = name;
  if (addressHint) {
    // Check if city is already in addressHint to avoid duplication
    const cityLower = city.toLowerCase();
    const hintLower = addressHint.toLowerCase();
    if (hintLower.includes(cityLower)) {
      query += ` ${addressHint}`;
    } else {
      query += ` ${addressHint} ${city}`;
    }
  } else {
    query += ` ${city}`;
  }
  query += ' CA';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Score a seed for deduplication priority (higher = better)
 */
function scoreSeed(seed: SeedPlace, isMustHave: boolean): number {
  let score = 0;
  
  // Must-have items get highest priority
  if (isMustHave) score += 1000;
  
  // Prefer placeId
  if (seed.placeId && seed.placeId.trim().length > 0) score += 100;
  
  // Prefer place over search
  if (seed.mapsType === 'place') score += 50;
  else if (seed.mapsType === 'search') score += 10;
  
  // Prefer addressHint
  if ((seed as any).addressHint && (seed as any).addressHint.trim().length > 0) score += 30;
  
  // Prefer address
  if (seed.address && seed.address.trim().length > 0) score += 20;
  
  return score;
}

/**
 * Merge tags from two arrays (union, no duplicates)
 */
function mergeTags(tags1?: string[], tags2?: string[]): string[] | undefined {
  const allTags = [...(tags1 || []), ...(tags2 || [])];
  if (allTags.length === 0) return undefined;
  
  // Remove duplicates and "musthave" tag (internal use only)
  const unique = Array.from(new Set(allTags)).filter(t => t !== 'musthave');
  return unique.length > 0 ? unique : undefined;
}

/**
 * Convert must-have item to SeedPlace format
 */
function convertMustHaveItem(item: any, category: SeedCategory): SeedPlace {
  const seed: SeedPlace = {
    name: item.name,
    city: item.city,
    mapsUrl: item.mapsUrl || generateSearchUrl(item.name, item.city, item.addressHint),
    mapsType: item.mapsType || (item.mapsUrl ? 'place' : 'search'),
    categoryTags: item.tags,
  };
  
  // Add optional fields if present
  if (item.placeId) seed.placeId = item.placeId;
  if (item.address) seed.address = item.address;
  if (item.addressHint) (seed as any).addressHint = item.addressHint;
  if (item.rating !== undefined) seed.rating = item.rating;
  if (item.userRatingCount !== undefined) seed.userRatingCount = item.userRatingCount;
  if (item.lat !== undefined) seed.lat = item.lat;
  if (item.lng !== undefined) seed.lng = item.lng;
  
  return seed;
}

/**
 * Merge must-have and existing seeds for a category
 */
function mergeCategory(category: SeedCategory): {
  mustHaveCount: number;
  originalCount: number;
  duplicatesRemoved: number;
  finalCount: number;
  replaced: Array<{ canonicalKey: string; oldName: string; newName: string }>;
} {
  const mustHavePath = join(MUSTHAVE_DIR, `${category}.musthave.json`);
  const seedPath = join(SEEDS_DIR, `${category}.json`);
  
  // Load must-have items
  let mustHaveItems: any[] = [];
  if (existsSync(mustHavePath)) {
    const mustHaveContent = readFileSync(mustHavePath, 'utf-8');
    mustHaveItems = JSON.parse(mustHaveContent);
  }
  
  // Load existing seed file
  let existingSeedFile: SeedFile;
  if (existsSync(seedPath)) {
    const seedContent = readFileSync(seedPath, 'utf-8');
    existingSeedFile = JSON.parse(seedContent);
  } else {
    // Create new seed file if doesn't exist
    existingSeedFile = {
      version: 1,
      category,
      region: 'southbay',
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }
  
  const mustHaveCount = mustHaveItems.length;
  const originalCount = existingSeedFile.items.length;
  
  // Convert must-have items to SeedPlace format
  const mustHaveSeeds = mustHaveItems.map(item => convertMustHaveItem(item, category));
  
  // Merge arrays: must-have first, then existing
  const allSeeds = [...mustHaveSeeds, ...existingSeedFile.items];
  
  // Deduplicate by canonical key with priority rules
  const seenByCanonical = new Map<string, { seed: SeedPlace; isMustHave: boolean; score: number }>();
  const replaced: Array<{ canonicalKey: string; oldName: string; newName: string }> = [];
  
  for (const seed of allSeeds) {
    const canonicalKey = getCanonicalKey(seed.name, seed.city);
    const isMustHave = mustHaveSeeds.includes(seed);
    const score = scoreSeed(seed, isMustHave);
    
    const existing = seenByCanonical.get(canonicalKey);
    
    if (!existing) {
      // First occurrence - keep it
      seenByCanonical.set(canonicalKey, { seed, isMustHave, score });
    } else {
      // Conflict - decide which to keep
      if (score > existing.score || (isMustHave && !existing.isMustHave)) {
        // New one is better or is must-have - replace
        const oldSeed = existing.seed;
        seenByCanonical.set(canonicalKey, { seed, isMustHave, score });
        
        // Track replacement
        replaced.push({
          canonicalKey,
          oldName: oldSeed.name,
          newName: seed.name,
        });
      }
      // Otherwise keep existing (already in map)
    }
  }
  
  // Merge tags for items that were kept from both sources
  const finalSeeds: SeedPlace[] = [];
  for (const { seed, isMustHave } of seenByCanonical.values()) {
    // If this seed exists in both must-have and existing, merge tags
    const mustHaveMatch = mustHaveSeeds.find(m => getCanonicalKey(m.name, m.city) === getCanonicalKey(seed.name, seed.city));
    const existingMatch = existingSeedFile.items.find(e => getCanonicalKey(e.name, e.city) === getCanonicalKey(seed.name, seed.city));
    
    if (mustHaveMatch && existingMatch) {
      // Merge tags
      seed.categoryTags = mergeTags(mustHaveMatch.categoryTags, existingMatch.categoryTags);
      
      // Preserve other fields from existing if not in must-have
      if (!seed.placeId && existingMatch.placeId) seed.placeId = existingMatch.placeId;
      if (!seed.address && existingMatch.address) seed.address = existingMatch.address;
      if (!seed.mapsUrl && existingMatch.mapsUrl) seed.mapsUrl = existingMatch.mapsUrl;
      if (!seed.mapsType && existingMatch.mapsType) seed.mapsType = existingMatch.mapsType;
      if (!seed.rating && existingMatch.rating) seed.rating = existingMatch.rating;
      if (!seed.userRatingCount && existingMatch.userRatingCount) seed.userRatingCount = existingMatch.userRatingCount;
      if (!seed.lat && existingMatch.lat) seed.lat = existingMatch.lat;
      if (!seed.lng && existingMatch.lng) seed.lng = existingMatch.lng;
    }
    
    finalSeeds.push(seed);
  }
  
  const duplicatesRemoved = allSeeds.length - finalSeeds.length;
  const finalCount = finalSeeds.length;
  
  // Write merged seed file
  const mergedSeedFile: SeedFile = {
    version: existingSeedFile.version,
    category,
    region: existingSeedFile.region || 'southbay',
    updatedAt: new Date().toISOString(),
    items: finalSeeds,
  };
  
  writeFileSync(seedPath, JSON.stringify(mergedSeedFile, null, 2), 'utf8');
  
  return {
    mustHaveCount,
    originalCount,
    duplicatesRemoved,
    finalCount,
    replaced,
  };
}

/**
 * Main function
 */
function main() {
  console.log('🔀 Merging must-have seeds into final seed pools...\n');
  
  const categories: SeedCategory[] = ['奶茶', '中餐', '夜宵', '新店打卡'];
  
  for (const category of categories) {
    console.log(`📄 ${category}:`);
    const result = mergeCategory(category);
    
    console.log(`   Must-have items: ${result.mustHaveCount}`);
    console.log(`   Original seed count: ${result.originalCount}`);
    console.log(`   Duplicates removed: ${result.duplicatesRemoved}`);
    console.log(`   Final count: ${result.finalCount}`);
    
    if (result.replaced.length > 0) {
      console.log(`   Must-have items that replaced existing seeds: ${result.replaced.length}`);
      if (result.replaced.length <= 10) {
        result.replaced.forEach(({ canonicalKey, oldName, newName }) => {
          console.log(`     - "${canonicalKey}": "${oldName}" → "${newName}"`);
        });
      } else {
        result.replaced.slice(0, 10).forEach(({ canonicalKey, oldName, newName }) => {
          console.log(`     - "${canonicalKey}": "${oldName}" → "${newName}"`);
        });
        console.log(`     ... and ${result.replaced.length - 10} more`);
      }
    }
    
    console.log('');
  }
  
  console.log('✅ Merge complete!');
  console.log('\n🔍 Running validator...\n');
}

main();
