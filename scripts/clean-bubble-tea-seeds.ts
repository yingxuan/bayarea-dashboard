/**
 * Clean and reduce bubble tea seed file
 * 
 * Goals:
 * - Reduce to 30-50 high-signal items
 * - One entry per brand (not per city)
 * - Must-have brands always included and prioritized
 * - Mark as "pre-resolve" stage
 * 
 * Usage: npx tsx scripts/clean-bubble-tea-seeds.ts
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace, SeedCategory } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const MUSTHAVE_DIR = join(SEEDS_DIR, '_musthave');
const CATEGORY: SeedCategory = '奶茶';

// City priority order (higher = better)
const CITY_PRIORITY: Record<string, number> = {
  'cupertino': 6,
  'sunnyvale': 5,
  'santa clara': 4,
  'mountain view': 3,
  'san jose': 2,
  'milpitas': 1,
};

// Brand variant normalization mapping
const BRAND_VARIANTS: Record<string, string> = {
  'tpumps': 'tpumps',
  'tea top': 'teatop',
  'tea top tea': 'teatop',
  'yi fang': 'yifang',
  'yi fang taiwan fruit tea': 'yifang',
  'coco fresh tea & juice': 'coco',
  'coco fresh tea and juice': 'coco',
  '85c bakery cafe': '85c',
  '85c': '85c',
  'chicha san chen': 'chicha',
  'chicha': 'chicha',
};

// Known city names to remove from brand names
const CITY_NAMES = ['cupertino', 'sunnyvale', 'santa clara', 'mountain view', 'san jose', 'milpitas', 'los altos'];

/**
 * Normalize brand name to canonical brand key
 */
function normalizeBrand(name: string): string {
  let normalized = name.trim().toLowerCase();
  
  // Remove punctuation
  normalized = normalized.replace(/[.,'’"()\-&]/g, ' ');
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Remove city names if accidentally included
  for (const city of CITY_NAMES) {
    const regex = new RegExp(`\\b${city}\\b`, 'gi');
    normalized = normalized.replace(regex, '').trim();
  }
  
  // Collapse whitespace again
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Apply brand variant normalization
  const lower = normalized.toLowerCase();
  for (const [variant, canonical] of Object.entries(BRAND_VARIANTS)) {
    if (lower === variant || lower.includes(variant)) {
      normalized = canonical;
      break;
    }
  }
  
  return normalized;
}

/**
 * Get city priority score
 */
function getCityPriority(city: string): number {
  const cityLower = city.toLowerCase().trim();
  return CITY_PRIORITY[cityLower] || 0;
}

/**
 * Score a seed for selection priority
 */
function scoreSeed(seed: SeedPlace, isMustHave: boolean, hasAddressHint: boolean): number {
  let score = 0;
  
  // Must-have items get highest priority
  if (isMustHave) score += 1000;
  
  // Prefer addressHint
  if (hasAddressHint) score += 100;
  
  // Prefer city by priority
  score += getCityPriority(seed.city);
  
  // Prefer placeId
  if (seed.placeId && seed.placeId.trim().length > 0) score += 50;
  
  // Prefer place over search
  if (seed.mapsType === 'place') score += 30;
  
  return score;
}

/**
 * Check if item is a known chain/popular brand
 */
function isKnownBrand(seed: SeedPlace): boolean {
  const tags = seed.categoryTags || [];
  const hasPopularTag = tags.some(t => 
    ['popular', 'premium', 'classic', 'chain'].includes(t.toLowerCase())
  );
  
  // Known chain brands
  const knownChains = [
    'boba guys', 'tpumps', 'sharetea', 'happy lemon', 'gong cha',
    'teaspoon', '7 leaves', 't4', 'tastea', 'royaltea', 'quickly',
    'milk tea', 'yi fang', 'coco', '85c', 'ten ren', 'fantasia'
  ];
  
  const nameLower = seed.name.toLowerCase();
  const isKnownChain = knownChains.some(chain => nameLower.includes(chain));
  
  return hasPopularTag || isKnownChain;
}

function main() {
  console.log('🧹 Cleaning bubble tea seed file...\n');
  
  // Load must-have items
  const mustHavePath = join(MUSTHAVE_DIR, `${CATEGORY}.musthave.json`);
  let mustHaveItems: any[] = [];
  if (existsSync(mustHavePath)) {
    const mustHaveContent = readFileSync(mustHavePath, 'utf-8');
    mustHaveItems = JSON.parse(mustHaveContent);
  }
  
  // Create must-have brand set
  const mustHaveBrands = new Set(
    mustHaveItems.map(item => normalizeBrand(item.name))
  );
  
  console.log(`📋 Must-have brands: ${mustHaveBrands.size}`);
  
  // Load existing seed file
  const seedPath = join(SEEDS_DIR, `${CATEGORY}.json`);
  if (!existsSync(seedPath)) {
    console.error(`❌ Seed file not found: ${seedPath}`);
    process.exit(1);
  }
  
  const seedContent = readFileSync(seedPath, 'utf-8');
  const seedFile: SeedFile = JSON.parse(seedContent);
  
  const originalCount = seedFile.items.length;
  console.log(`📄 Original seed count: ${originalCount}\n`);
  
  // STEP 1 & 2: Collapse multi-city duplicates by brand key
  const brandMap = new Map<string, {
    seed: SeedPlace;
    isMustHave: boolean;
    hasAddressHint: boolean;
    score: number;
  }>();
  
  // First, process must-have items
  for (const mustHaveItem of mustHaveItems) {
    const brandKey = normalizeBrand(mustHaveItem.name);
    // Remove "musthave" tag (internal use only)
    const tags = (mustHaveItem.tags || []).filter(t => t !== 'musthave');
    
    const seed: SeedPlace = {
      name: mustHaveItem.name,
      city: mustHaveItem.city,
      mapsUrl: mustHaveItem.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mustHaveItem.name} ${mustHaveItem.city} CA`)}`,
      mapsType: mustHaveItem.mapsType || 'search',
      categoryTags: tags.length > 0 ? tags : undefined,
    };
    if (mustHaveItem.addressHint) (seed as any).addressHint = mustHaveItem.addressHint;
    if (mustHaveItem.placeId) seed.placeId = mustHaveItem.placeId;
    if (mustHaveItem.address) seed.address = mustHaveItem.address;
    
    const hasAddressHint = !!(mustHaveItem.addressHint);
    const score = scoreSeed(seed, true, hasAddressHint);
    
    brandMap.set(brandKey, {
      seed,
      isMustHave: true,
      hasAddressHint,
      score,
    });
  }
  
  // Then, process existing seed items (only if not already in must-have)
  for (const seed of seedFile.items) {
    const brandKey = normalizeBrand(seed.name);
    
    // Skip if already have a must-have version
    if (brandMap.has(brandKey) && brandMap.get(brandKey)!.isMustHave) {
      continue;
    }
    
    // Remove "musthave" tag from existing seeds
    const cleanedSeed = { ...seed };
    if (cleanedSeed.categoryTags) {
      cleanedSeed.categoryTags = cleanedSeed.categoryTags.filter(t => t !== 'musthave');
      if (cleanedSeed.categoryTags.length === 0) {
        cleanedSeed.categoryTags = undefined;
      }
    }
    
    const isMustHave = mustHaveBrands.has(brandKey);
    const hasAddressHint = !!(cleanedSeed as any).addressHint;
    const score = scoreSeed(cleanedSeed, isMustHave, hasAddressHint);
    
    const existing = brandMap.get(brandKey);
    if (!existing || score > existing.score) {
      brandMap.set(brandKey, {
        seed: cleanedSeed,
        isMustHave,
        hasAddressHint,
        score,
      });
    }
  }
  
  const afterDedupCount = brandMap.size;
  const duplicatesRemoved = originalCount - afterDedupCount;
  console.log(`🔄 After brand deduplication: ${afterDedupCount} items (${duplicatesRemoved} duplicates removed)\n`);
  
  // STEP 3 & 4: Separate must-have and others, then cap size
  const mustHaveSeeds: SeedPlace[] = [];
  const otherSeeds: SeedPlace[] = [];
  
  for (const { seed, isMustHave } of brandMap.values()) {
    if (isMustHave) {
      mustHaveSeeds.push(seed);
    } else {
      otherSeeds.push(seed);
    }
  }
  
  console.log(`⭐ Must-have items: ${mustHaveSeeds.length}`);
  console.log(`📦 Other items: ${otherSeeds.length}`);
  
  // Sort other seeds by priority (known brands first)
  otherSeeds.sort((a, b) => {
    const aKnown = isKnownBrand(a);
    const bKnown = isKnownBrand(b);
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return 0;
  });
  
  // Cap total size to 30-50 items
  const maxOtherItems = Math.max(0, 50 - mustHaveSeeds.length);
  const finalOtherSeeds = otherSeeds.slice(0, maxOtherItems);
  
  // Combine: must-have first, then others
  const finalSeeds = [...mustHaveSeeds, ...finalOtherSeeds];
  
  const finalCount = finalSeeds.length;
  const itemsDropped = afterDedupCount - finalCount;
  
  console.log(`\n✂️  After size cap: ${finalCount} items (${itemsDropped} items dropped)`);
  console.log(`   - Must-have: ${mustHaveSeeds.length}`);
  console.log(`   - Other: ${finalOtherSeeds.length}\n`);
  
  // STEP 5: Create cleaned seed file with "pre-resolve" stage marker
  const cleanedSeedFile: SeedFile & { stage?: string } = {
    version: seedFile.version,
    category: CATEGORY,
    region: seedFile.region || 'southbay',
    updatedAt: new Date().toISOString(),
    stage: 'pre-resolve',
    items: finalSeeds,
  };
  
  // Write cleaned file
  writeFileSync(seedPath, JSON.stringify(cleanedSeedFile, null, 2), 'utf8');
  
  // Summary
  console.log('📊 Summary:');
  console.log(`   Original count: ${originalCount}`);
  console.log(`   Duplicate brands removed: ${duplicatesRemoved}`);
  console.log(`   Items dropped (size cap): ${itemsDropped}`);
  console.log(`   Final count: ${finalCount}`);
  console.log(`   Must-have brands ensured: ${mustHaveSeeds.length}/${mustHaveBrands.size}`);
  console.log(`\n✅ Cleaned file written to: ${seedPath}`);
  console.log(`   Stage: pre-resolve (offline resolve to placeId/googleMapsUri required before production)`);
}

main();
