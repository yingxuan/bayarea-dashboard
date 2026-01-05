/**
 * Comprehensive cleanup and rebuild of all South Bay seed files
 * 
 * Steps:
 * 1. Remove duplicates (name+city)
 * 2. Remove fake/generic place names
 * 3. Validate mapsUrl
 * 4. Rebuild authoritative lists (30-50 items per category)
 * 5. Enforce structure compliance
 * 
 * Usage: npx tsx scripts/cleanup-all-seeds.ts
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace, SeedCategory } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const MUSTHAVE_DIR = join(SEEDS_DIR, '_musthave');

// Fake/generic place names to remove (hard rule)
const FAKE_PLACE_NAMES = [
  'hot pot city',
  'the pot',
  'bbq house',
  'korean bbq',
  'late night hot pot',
  'all you can eat bbq',
  'bbq king',
  'bbq express',
  'hot pot express',
  'spicy pot',
  'fire pot',
  'shabu house',
  'gen korean bbq house', // Generic name
  'gen korean bbq', // Generic name
  'superhot hotpot & korean bbq', // Generic name
  'superhot hotpot', // Generic name
  'denny\'s', // Chain, not late-night specific
  'dennys', // Chain, not late-night specific
];

// Must-have brands per category (authoritative lists)
const MUST_HAVE_BRANDS: Record<SeedCategory, string[]> = {
  '奶茶': [
    'CHICHA San Chen',
    'Molly Tea',
    'HeyTea',
    'The Alley',
    'Tiger Sugar',
    'TPumps',
    'Tpumps',
    'One Zo',
    'Tea Top',
    'Meet Fresh',
    'Boba Guys',
    'Urban Ritual',
    'Sunright Tea Studio',
    'Wanpo',
    'Yi Fang',
    'YiFang',
    'Gong Cha',
    'Xing Fu Tang',
    'YiFang Taiwan Fruit Tea',
  ],
  '中餐': [
    'Szechuan Impression',
    'Spicy Hunan',
    'Hunan Impression',
    'Hankow Cuisine',
    'Shanghai Garden',
    'Tai Pan',
    'New Port',
    'New Port Restaurant',
    'Ox 9 Lanzhou',
    'QQ Noodle',
    'Dough Zone',
    'Dumpling Time',
  ],
  '夜宵': [
    'Haidilao',
    'Haidilao Hot Pot',
    'Boiling Point',
    'Hankow Cuisine',
    'Ramen Nagi',
    'Pho Kim Long',
  ],
  '新店打卡': [], // Will be populated from must-have file
};

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Check if place name is fake/generic
 */
function isFakePlaceName(name: string): boolean {
  const normalized = normalizeName(name);
  // Check for exact matches or contains fake patterns
  return FAKE_PLACE_NAMES.some(fake => {
    // Exact match or name contains the fake pattern
    return normalized === fake || normalized.includes(fake);
  });
}

/**
 * Validate mapsUrl
 */
function isValidMapsUrl(mapsUrl: string, name: string, city: string): boolean {
  if (!mapsUrl || mapsUrl.trim().length === 0) return false;
  
  // Must be Google Maps URL
  if (!mapsUrl.includes('google.com/maps') && !mapsUrl.includes('goo.gl/maps')) {
    return false;
  }
  
  // For search URLs, check if query matches name+city
  if (mapsUrl.includes('/search/') || mapsUrl.includes('?q=')) {
    try {
      const urlObj = new URL(mapsUrl);
      const query = urlObj.searchParams.get('query') || urlObj.searchParams.get('q') || '';
      const decodedQuery = decodeURIComponent(query).toLowerCase();
      const nameLower = normalizeName(name);
      const cityLower = city.toLowerCase();
      
      // Query should contain name and city
      if (!decodedQuery.includes(nameLower) || !decodedQuery.includes(cityLower)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  
  return true;
}

/**
 * Clean and rebuild a category
 */
function cleanupCategory(category: SeedCategory): {
  originalCount: number;
  removedDuplicates: number;
  removedFake: number;
  removedInvalid: number;
  finalCount: number;
} {
  const seedPath = join(SEEDS_DIR, `${category}.json`);
  const mustHavePath = join(MUSTHAVE_DIR, `${category}.musthave.json`);
  
  // Load existing seed file
  if (!existsSync(seedPath)) {
    console.error(`❌ Seed file not found: ${seedPath}`);
    return { originalCount: 0, removedDuplicates: 0, removedFake: 0, removedInvalid: 0, finalCount: 0 };
  }
  
  const seedContent = readFileSync(seedPath, 'utf-8');
  const seedFile: SeedFile = JSON.parse(seedContent);
  
  const originalCount = seedFile.items.length;
  console.log(`\n📄 ${category}: ${originalCount} items`);
  
  // Load must-have items if exists
  let mustHaveItems: any[] = [];
  if (existsSync(mustHavePath)) {
    const mustHaveContent = readFileSync(mustHavePath, 'utf-8');
    mustHaveItems = JSON.parse(mustHaveContent);
  }
  
  // Step 1: Remove fake/generic place names
  let items = seedFile.items.filter(item => {
    if (isFakePlaceName(item.name)) {
      console.log(`   ❌ Removed fake: "${item.name}"`);
      return false;
    }
    return true;
  });
  
  const removedFake = originalCount - items.length;
  
  // Step 2: Remove invalid mapsUrl
  const beforeInvalidCheck = items.length;
  items = items.filter(item => {
    if (!isValidMapsUrl(item.mapsUrl, item.name, item.city)) {
      console.log(`   ❌ Removed invalid URL: "${item.name}" (${item.city})`);
      return false;
    }
    return true;
  });
  
  const removedInvalid = beforeInvalidCheck - items.length;
  
  // Step 3: Remove duplicates (name+city)
  const seen = new Map<string, SeedPlace>();
  const deduped: SeedPlace[] = [];
  
  for (const item of items) {
    const key = `${normalizeName(item.name)}|${item.city.toLowerCase().trim()}`;
    
    if (seen.has(key)) {
      // Keep the one with better data (placeId > mapsType=place > has address)
      const existing = seen.get(key)!;
      const existingScore = (existing.placeId ? 100 : 0) + (existing.mapsType === 'place' ? 50 : 0) + (existing.address ? 25 : 0);
      const newScore = (item.placeId ? 100 : 0) + (item.mapsType === 'place' ? 50 : 0) + (item.address ? 25 : 0);
      
      if (newScore > existingScore) {
        // Replace with better one
        const index = deduped.indexOf(existing);
        if (index >= 0) {
          deduped[index] = item;
          seen.set(key, item);
        }
      }
      // Otherwise keep existing
    } else {
      seen.set(key, item);
      deduped.push(item);
    }
  }
  
  const removedDuplicates = items.length - deduped.length;
  
  // Step 4: Merge with must-have items (must-have always wins)
  // But first, filter out fake names from must-have items too
  const mustHaveMap = new Map<string, SeedPlace>();
  
  for (const mustHaveItem of mustHaveItems) {
    // Skip fake names even in must-have (data quality)
    if (isFakePlaceName(mustHaveItem.name)) {
      console.log(`   ⚠️  Skipped fake in must-have: "${mustHaveItem.name}"`);
      continue;
    }
    
    const seed: SeedPlace = {
      name: mustHaveItem.name,
      city: mustHaveItem.city,
      mapsUrl: mustHaveItem.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mustHaveItem.name} ${mustHaveItem.city} CA`)}`,
      mapsType: mustHaveItem.mapsType || 'search',
      categoryTags: (mustHaveItem.tags || []).filter((t: string) => t !== 'musthave'),
    };
    if (mustHaveItem.placeId) seed.placeId = mustHaveItem.placeId;
    if (mustHaveItem.address) seed.address = mustHaveItem.address;
    if (mustHaveItem.addressHint) (seed as any).addressHint = mustHaveItem.addressHint;
    
    const key = `${normalizeName(seed.name)}|${seed.city.toLowerCase().trim()}`;
    mustHaveMap.set(key, seed);
  }
  
  // Combine: must-have first, then deduped (excluding conflicts)
  const finalItems: SeedPlace[] = [];
  const finalKeys = new Set<string>();
  
  // Add must-have items first
  for (const [key, item] of mustHaveMap) {
    finalItems.push(item);
    finalKeys.add(key);
  }
  
  // Add deduped items (skip if already in must-have)
  for (const item of deduped) {
    const key = `${normalizeName(item.name)}|${item.city.toLowerCase().trim()}`;
    if (!finalKeys.has(key)) {
      finalItems.push(item);
      finalKeys.add(key);
    }
  }
  
  // Save original finalItems before brand collapse (for later supplementation)
  const originalFinalItems = [...finalItems];
  
  // Step 5: Collapse by brand (one entry per brand, not per city)
  // This prevents "copying city to pad numbers"
  const brandMap = new Map<string, SeedPlace>();
  
  // City priority for selection
  const cityPriority: Record<string, number> = {
    'cupertino': 6,
    'sunnyvale': 5,
    'santa clara': 4,
    'mountain view': 3,
    'san jose': 2,
    'milpitas': 1,
    'los altos': 3.5, // Between Mountain View and San Jose
  };
  
  function getCityScore(city: string): number {
    return cityPriority[city.toLowerCase().trim()] || 0;
  }
  
  function scoreItem(item: SeedPlace, isMustHave: boolean): number {
    let score = 0;
    if (isMustHave) score += 1000;
    score += getCityScore(item.city);
    if (item.placeId) score += 100;
    if (item.mapsType === 'place') score += 50;
    if (item.address) score += 25;
    if ((item as any).addressHint) score += 20;
    return score;
  }
  
  const mustHaveBrandSet = new Set(MUST_HAVE_BRANDS[category].map(n => normalizeName(n)));
  
  // First pass: collect by brand, keep best city for each brand
  for (const item of finalItems) {
    const brandKey = normalizeName(item.name);
    const isMustHave = mustHaveBrandSet.has(brandKey) || 
                       Array.from(mustHaveBrandSet).some(brand => brandKey.includes(brand) || brandKey === brand);
    const score = scoreItem(item, isMustHave);
    
    const existing = brandMap.get(brandKey);
    if (!existing) {
      brandMap.set(brandKey, item);
    } else {
      const existingIsMustHave = mustHaveBrandSet.has(normalizeName(existing.name)) || 
                                  Array.from(mustHaveBrandSet).some(brand => normalizeName(existing.name).includes(brand) || normalizeName(existing.name) === brand);
      const existingScore = scoreItem(existing, existingIsMustHave);
      
      if (score > existingScore) {
        brandMap.set(brandKey, item);
      }
    }
  }
  
  // Convert to array and sort: must-have brands first, then by priority
  const brandItems = Array.from(brandMap.values());
  const authoritative: SeedPlace[] = [];
  const otherItems: SeedPlace[] = [];
  
  for (const item of brandItems) {
    const nameNorm = normalizeName(item.name);
    const isMustHaveBrand = mustHaveBrandSet.has(nameNorm) || 
                            Array.from(mustHaveBrandSet).some(brand => nameNorm.includes(brand) || nameNorm === brand);
    const isKnownChain = (item.categoryTags || []).some(tag => 
      ['chain', 'popular', 'premium', 'classic'].includes(tag.toLowerCase())
    );
    
    if (isMustHaveBrand) {
      authoritative.push(item);
    } else if (isKnownChain) {
      authoritative.push(item);
    } else {
      otherItems.push(item);
    }
  }
  
  // Sort authoritative by priority (must-have first, then by city priority)
  authoritative.sort((a, b) => {
    const aMustHave = mustHaveBrandSet.has(normalizeName(a.name)) || 
                      Array.from(mustHaveBrandSet).some(brand => normalizeName(a.name).includes(brand) || normalizeName(a.name) === brand);
    const bMustHave = mustHaveBrandSet.has(normalizeName(b.name)) || 
                      Array.from(mustHaveBrandSet).some(brand => normalizeName(b.name).includes(brand) || normalizeName(b.name) === brand);
    
    if (aMustHave && !bMustHave) return -1;
    if (!aMustHave && bMustHave) return 1;
    
    return getCityScore(b.city) - getCityScore(a.city);
  });
  
  // Add other items up to 50 total, but ensure at least 30
  const minItems = 30;
  const maxItems = 50;
  
  // Sort otherItems by quality (known chains/popular first)
  otherItems.sort((a, b) => {
    const aKnown = (a.categoryTags || []).some(tag => 
      ['chain', 'popular', 'premium', 'classic'].includes(tag.toLowerCase())
    );
    const bKnown = (b.categoryTags || []).some(tag => 
      ['chain', 'popular', 'premium', 'classic'].includes(tag.toLowerCase())
    );
    if (aKnown && !bKnown) return -1;
    if (!aKnown && bKnown) return 1;
    return getCityScore(b.city) - getCityScore(a.city);
  });
  
  if (authoritative.length < minItems) {
    // Need more items - add from otherItems
    const needed = minItems - authoritative.length;
    authoritative.push(...otherItems.slice(0, needed));
  } else if (authoritative.length < maxItems) {
    // Can add more up to max
    const remaining = maxItems - authoritative.length;
    authoritative.push(...otherItems.slice(0, remaining));
  } else {
    // Already at max, trim if needed
    authoritative.splice(maxItems);
  }
  
  // If still below minimum after brand dedup, allow some brands in multiple cities
  // (but only for known chains/popular brands, max 2 cities per brand)
  if (authoritative.length < minItems) {
    const brandCount = new Map<string, number>();
    const additionalItems: SeedPlace[] = [];
    
    // Count brands already in authoritative
    authoritative.forEach(item => {
      const brandKey = normalizeName(item.name);
      brandCount.set(brandKey, (brandCount.get(brandKey) || 0) + 1);
    });
    
    // Go through original finalItems (before brand collapse)
    // Sort by quality first
    const sortedOriginal = [...originalFinalItems].sort((a, b) => {
      const aKnown = (a.categoryTags || []).some(tag => 
        ['chain', 'popular', 'premium', 'classic'].includes(tag.toLowerCase())
      );
      const bKnown = (b.categoryTags || []).some(tag => 
        ['chain', 'popular', 'premium', 'classic'].includes(tag.toLowerCase())
      );
      if (aKnown && !bKnown) return -1;
      if (!aKnown && bKnown) return 1;
      return getCityScore(b.city) - getCityScore(a.city);
    });
    
    for (const item of sortedOriginal) {
      const brandKey = normalizeName(item.name);
      const currentCount = brandCount.get(brandKey) || 0;
      
      // Skip if already in authoritative with same city
      const alreadyIncluded = authoritative.some(a => 
        normalizeName(a.name) === brandKey && a.city === item.city
      );
      
      if (!alreadyIncluded && currentCount < 2) {
        const isKnownChain = (item.categoryTags || []).some(tag => 
          ['chain', 'popular', 'premium', 'classic'].includes(tag.toLowerCase())
        );
        
        // Allow up to 2 cities per brand if it's a known chain/popular, or if we're still below min
        if (isKnownChain || authoritative.length + additionalItems.length < minItems) {
          additionalItems.push(item);
          brandCount.set(brandKey, currentCount + 1);
          
          if (authoritative.length + additionalItems.length >= minItems) {
            break;
          }
        }
      }
    }
    
    // Add additional items
    authoritative.push(...additionalItems);
    
    // Sort again after adding
    authoritative.sort((a, b) => {
      const aMustHave = mustHaveBrandSet.has(normalizeName(a.name)) || 
                        Array.from(mustHaveBrandSet).some(brand => normalizeName(a.name).includes(brand) || normalizeName(a.name) === brand);
      const bMustHave = mustHaveBrandSet.has(normalizeName(b.name)) || 
                        Array.from(mustHaveBrandSet).some(brand => normalizeName(b.name).includes(brand) || normalizeName(b.name) === brand);
      
      if (aMustHave && !bMustHave) return -1;
      if (!aMustHave && bMustHave) return 1;
      
      return getCityScore(b.city) - getCityScore(a.city);
    });
  }
  
  const finalCount = authoritative.length;
  
  // Step 6: Clean structure (remove query field and other non-schema fields, ensure required fields)
  const cleanedItems = authoritative.map(item => {
    // Create clean object with only schema fields
    const cleaned: SeedPlace = {
      name: item.name.trim(),
      city: item.city.trim(),
      mapsUrl: item.mapsUrl.trim(),
      mapsType: item.mapsType || (item.mapsUrl.includes('/place/') ? 'place' : 'search'),
    };
    
    // Only include optional fields if they exist and are valid
    if (item.categoryTags && Array.isArray(item.categoryTags) && item.categoryTags.length > 0) {
      const filteredTags = item.categoryTags.filter(t => t && typeof t === 'string' && t.trim().length > 0);
      if (filteredTags.length > 0) {
        cleaned.categoryTags = filteredTags;
      }
    }
    if (item.placeId && typeof item.placeId === 'string' && item.placeId.trim().length > 0) {
      cleaned.placeId = item.placeId.trim();
    }
    if (item.address && typeof item.address === 'string' && item.address.trim().length > 0) {
      cleaned.address = item.address.trim();
    }
    if (item.rating !== undefined && typeof item.rating === 'number') {
      cleaned.rating = item.rating;
    }
    if (item.userRatingCount !== undefined && typeof item.userRatingCount === 'number') {
      cleaned.userRatingCount = item.userRatingCount;
    }
    if (item.lat !== undefined && typeof item.lat === 'number') {
      cleaned.lat = item.lat;
    }
    if (item.lng !== undefined && typeof item.lng === 'number') {
      cleaned.lng = item.lng;
    }
    
    // Explicitly exclude: query, addressHint, and any other non-schema fields
    
    return cleaned;
  });
  
  // Final deduplication check (name+city)
  const finalDeduped: SeedPlace[] = [];
  const finalSeen = new Set<string>();
  
  for (const item of cleanedItems) {
    const key = `${normalizeName(item.name)}|${item.city.toLowerCase().trim()}`;
    if (!finalSeen.has(key)) {
      finalSeen.add(key);
      finalDeduped.push(item);
    }
  }
  
  const finalCountAfterDedup = finalDeduped.length;
  
  // Write cleaned file
  const cleanedFile: SeedFile = {
    version: seedFile.version || 1,
    category,
    region: seedFile.region || 'southbay',
    updatedAt: new Date().toISOString(),
    items: finalDeduped,
  };
  
  writeFileSync(seedPath, JSON.stringify(cleanedFile, null, 2), 'utf8');
  
  const totalRemoved = removedDuplicates + (cleanedItems.length - finalDeduped.length);
  
  console.log(`   ✅ Final: ${finalCountAfterDedup} items`);
  console.log(`      - Removed duplicates: ${totalRemoved}`);
  console.log(`      - Removed fake: ${removedFake}`);
  console.log(`      - Removed invalid: ${removedInvalid}`);
  
  return {
    originalCount,
    removedDuplicates: totalRemoved,
    removedFake,
    removedInvalid,
    finalCount: finalCountAfterDedup,
  };
}

function main() {
  console.log('🧹 Comprehensive cleanup of all seed files...\n');
  
  const categories: SeedCategory[] = ['奶茶', '中餐', '夜宵', '新店打卡'];
  
  const results = categories.map(category => cleanupCategory(category));
  
  console.log('\n📊 Summary:');
  console.log('   Category | Original | Duplicates | Fake | Invalid | Final');
  console.log('   ---------|----------|------------|------|---------|------');
  categories.forEach((cat, i) => {
    const r = results[i];
    console.log(`   ${cat.padEnd(8)} | ${String(r.originalCount).padStart(8)} | ${String(r.removedDuplicates).padStart(10)} | ${String(r.removedFake).padStart(4)} | ${String(r.removedInvalid).padStart(7)} | ${String(r.finalCount).padStart(5)}`);
  });
  
  console.log('\n✅ Cleanup complete!');
  console.log('\n🔍 Running validator...\n');
}

main();
