/**
 * FINAL CLEANUP: Strict pruning, deduplication, and re-classification
 * 
 * Rules:
 * 1. One place = ONE primary category (priority: 奶茶 > 中餐 > 夜宵 > 新店打卡)
 * 2. Canonical deduplication across ALL files
 * 3. Category-specific pruning and validation
 * 
 * Usage: npx tsx scripts/final-cleanup-seeds.ts
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace, SeedCategory } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const MUSTHAVE_DIR = join(SEEDS_DIR, '_musthave');

// Category priority (higher = more important)
const CATEGORY_PRIORITY: Record<SeedCategory, number> = {
  '奶茶': 4,
  '中餐': 3,
  '夜宵': 2,
  '新店打卡': 1,
};

// Category size targets
const CATEGORY_TARGETS: Record<SeedCategory, { min: number; max: number }> = {
  '奶茶': { min: 25, max: 35 },
  '中餐': { min: 30, max: 40 },
  '夜宵': { min: 20, max: 30 },
  '新店打卡': { min: 15, max: 25 },
};

// Must-have brands per category
const MUST_HAVE_BRANDS: Record<SeedCategory, string[]> = {
  '奶茶': [
    'CHICHA San Chen',
    'Molly Tea',
    'WOW Tea Drink',
    'MoonTea',
    'TPumps',
    'Tpumps',
    'One Zo',
    'Tea Top',
    'Meet Fresh',
    'Boba Guys',
    'The Alley',
    'Tiger Sugar',
    'YiFang',
    'YiFang Taiwan Fruit Tea',
    'Gong Cha',
    'Xing Fu Tang',
    'Sunright Tea Studio',
    'Urban Ritual',
  ],
  '中餐': [],
  '夜宵': [],
  '新店打卡': [],
};

/**
 * Normalize name for canonical key
 */
function normalizeName(name: string): string {
  let normalized = name.trim().toLowerCase();
  normalized = normalized.replace(/&/g, 'and');
  normalized = normalized.replace(/[.,''"()\-]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Brand variants
  const variants: Record<string, string> = {
    'coco fresh tea & juice': 'coco',
    'coco fresh tea and juice': 'coco',
    '85c bakery cafe': '85c',
    'tpumps': 'tpumps',
  };
  
  for (const [variant, canonical] of Object.entries(variants)) {
    if (normalized.includes(variant) || normalized === variant) {
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
  if (normalized === 'sanjose' || normalized === 'san jose') {
    normalized = 'san jose';
  }
  return normalized;
}

/**
 * Get canonical key
 */
function getCanonicalKey(name: string, city: string): string {
  return `${normalizeName(name)}|${normalizeCity(city)}`;
}

/**
 * Check if place is boba/tea focused
 */
function isBobaTeaPlace(item: SeedPlace): boolean {
  const name = normalizeName(item.name);
  const tags = (item.categoryTags || []).map(t => t.toLowerCase());
  
  const bobaKeywords = [
    'tea', 'boba', 'bubble', '奶茶', 'milk tea', 'fruit tea',
    'tpumps', 'tiger sugar', 'the alley', 'one zo', 'meet fresh',
    'gong cha', 'yifang', 'chicha', 'molly', 'wow tea', 'moontea',
  ];
  
  return bobaKeywords.some(keyword => name.includes(keyword) || tags.includes(keyword));
}

/**
 * Check if place is late-night appropriate
 */
function isLateNightPlace(item: SeedPlace): boolean {
  const name = normalizeName(item.name);
  const tags = (item.categoryTags || []).map(t => t.toLowerCase());
  
  const lateNightKeywords = [
    'hotpot', 'hot pot', 'ramen', 'pho', 'izakaya', 'korean bbq',
    'late-night', 'late night', 'shabu', 'boiling point',
  ];
  
  return lateNightKeywords.some(keyword => 
    name.includes(keyword) || tags.includes(keyword)
  );
}

/**
 * Check if place is genuinely new/trendy
 */
function isNewPlace(item: SeedPlace): boolean {
  const name = normalizeName(item.name);
  const tags = (item.categoryTags || []).map(t => t.toLowerCase());
  
  // Explicit new/trendy tags
  if (tags.includes('new') || tags.includes('trendy') || tags.includes('new-ish')) {
    return true;
  }
  
  // Known new places (recently opened or trendy)
  const newPlaceNames = [
    'moontea', 'chicha', 'the x pot', 'seapot', 'marufuku', 'baekjeong',
    'eataly', 'ox 9 lanzhou', 'chong qing xiao mian', 'dough zone',
    'urban ritual', 'paris baguette',
  ];
  
  return newPlaceNames.some(newName => name.includes(newName));
}

/**
 * Determine best category for a place
 */
function determineBestCategory(item: SeedPlace, currentCategory: SeedCategory): SeedCategory {
  // Priority order: 奶茶 > 中餐 > 夜宵 > 新店打卡
  
  // If it's a boba/tea place, it belongs in 奶茶
  if (isBobaTeaPlace(item)) {
    return '奶茶';
  }
  
  // If it's late-night appropriate, consider 夜宵
  if (isLateNightPlace(item)) {
    // But if it's also Chinese food, prefer 中餐 unless it's clearly late-night focused
    const isChinese = (item.categoryTags || []).some(t => 
      ['sichuan', 'hunan', 'cantonese', 'taiwanese', 'chinese'].includes(t.toLowerCase())
    );
    if (isChinese && currentCategory === '中餐') {
      return '中餐'; // Keep in 中餐 if already there
    }
    return '夜宵';
  }
  
  // If it's genuinely new, consider 新店打卡
  if (isNewPlace(item) && currentCategory === '新店打卡') {
    return '新店打卡';
  }
  
  // Default: keep in current category or move to 中餐 if unclear
  if (currentCategory === '中餐') {
    return '中餐';
  }
  
  // If it's Chinese food, move to 中餐
  const isChinese = (item.categoryTags || []).some(t => 
    ['sichuan', 'hunan', 'cantonese', 'taiwanese', 'chinese', 'noodles', 'dumplings'].includes(t.toLowerCase())
  );
  if (isChinese) {
    return '中餐';
  }
  
  // Otherwise keep in current category
  return currentCategory;
}

/**
 * Clean and classify a category
 */
function cleanupCategory(
  category: SeedCategory,
  allPlaces: Map<string, { item: SeedPlace; category: SeedCategory; index: number }>
): {
  originalCount: number;
  removedDuplicates: number;
  removedMisclassified: number;
  finalCount: number;
  items: SeedPlace[];
} {
  const seedPath = join(SEEDS_DIR, `${category}.json`);
  
  if (!existsSync(seedPath)) {
    return { originalCount: 0, removedDuplicates: 0, removedMisclassified: 0, finalCount: 0, items: [] };
  }
  
  const seedContent = readFileSync(seedPath, 'utf-8');
  const seedFile: SeedFile = JSON.parse(seedContent);
  
  const originalCount = seedFile.items.length;
  const target = CATEGORY_TARGETS[category];
  
  // Step 1: Filter items that belong in this category
  const validItems: SeedPlace[] = [];
  const removedMisclassified: SeedPlace[] = [];
  
  for (const item of seedFile.items) {
    const canonicalKey = getCanonicalKey(item.name, item.city);
    const bestCategory = determineBestCategory(item, category);
    
    // Special handling for 新店打卡: be more lenient to meet minimum
    if (category === '新店打卡') {
      const existing = allPlaces.get(canonicalKey);
      const isInHigherPriority = existing && CATEGORY_PRIORITY[existing.category] > CATEGORY_PRIORITY[category];
      
      // If it's genuinely new and not in a higher-priority category, keep it
      if (!isInHigherPriority) {
        const isNew = isNewPlace(item) || (item.categoryTags || []).some(t => 
          ['new', 'trendy', 'new-ish'].includes(t.toLowerCase())
        );
        
        // Also check if it's a new concept (not just a new location of existing brand)
        const nameNorm = normalizeName(item.name);
        const isNewConcept = [
          'moontea', 'chicha', 'the x pot', 'seapot', 'marufuku', 'baekjeong',
          'eataly', 'ox 9 lanzhou', 'chong qing xiao mian', 'dough zone',
          'urban ritual', 'paris baguette', '85c bakery', '85c',
        ].some(newName => nameNorm.includes(newName));
        
        if (isNew || isNewConcept) {
          // But don't keep if it's clearly boba (奶茶 priority) or Chinese food (中餐 priority)
          const isBoba = isBobaTeaPlace(item);
          const isChinese = (item.categoryTags || []).some(t => 
            ['sichuan', 'hunan', 'cantonese', 'taiwanese', 'chinese'].includes(t.toLowerCase())
          );
          
          // Only exclude if it's STRONGLY boba or Chinese (not just tagged)
          if (!isBoba && !isChinese) {
            validItems.push(item);
            continue;
          }
        }
      }
      // Otherwise, it belongs elsewhere
      removedMisclassified.push(item);
      continue;
    }
    
    if (bestCategory !== category) {
      removedMisclassified.push(item);
      continue;
    }
    
    // Check if this place appears in a higher-priority category
    const existing = allPlaces.get(canonicalKey);
    if (existing && CATEGORY_PRIORITY[existing.category] > CATEGORY_PRIORITY[category]) {
      removedMisclassified.push(item);
      continue;
    }
    
    validItems.push(item);
  }
  
  // Step 2: Deduplicate within category
  const deduped: SeedPlace[] = [];
  const seen = new Set<string>();
  
  for (const item of validItems) {
    const canonicalKey = getCanonicalKey(item.name, item.city);
    if (!seen.has(canonicalKey)) {
      seen.add(canonicalKey);
      deduped.push(item);
    }
  }
  
  const removedDuplicates = validItems.length - deduped.length;
  
  // Step 3: Category-specific filtering
  let filtered = deduped;
  
  if (category === '奶茶') {
    // Remove non-boba places
    filtered = deduped.filter(item => {
      if (!isBobaTeaPlace(item)) {
        // Check if it's a must-have brand
        const nameNorm = normalizeName(item.name);
        const isMustHave = MUST_HAVE_BRANDS['奶茶'].some(brand => 
          normalizeName(brand) === nameNorm || nameNorm.includes(normalizeName(brand))
        );
        return isMustHave;
      }
      return true;
    });
  } else if (category === '夜宵') {
    // Remove non-late-night places
    filtered = deduped.filter(item => isLateNightPlace(item));
  } else if (category === '新店打卡') {
    // For 新店打卡, be more lenient if we're below minimum
    // Keep items that are new OR trendy OR recently opened
    filtered = deduped.filter(item => {
      if (isNewPlace(item)) {
        return true;
      }
      // If below minimum, also keep items with "new" in tags or trendy concepts
      const tags = (item.categoryTags || []).map(t => t.toLowerCase());
      if (tags.includes('new') || tags.includes('trendy') || tags.includes('new-ish')) {
        return true;
      }
      return false;
    });
  }
  
  // Step 4: Ensure must-have brands are included (奶茶 only)
  if (category === '奶茶') {
    const mustHaveSet = new Set(MUST_HAVE_BRANDS['奶茶'].map(b => normalizeName(b)));
    const existingBrands = new Set(filtered.map(item => normalizeName(item.name)));
    
    // Load must-have file if exists
    const mustHavePath = join(MUSTHAVE_DIR, `${category}.musthave.json`);
    if (existsSync(mustHavePath)) {
      const mustHaveContent = readFileSync(mustHavePath, 'utf-8');
      const mustHaveItems: any[] = JSON.parse(mustHaveContent);
      
      for (const mustHaveItem of mustHaveItems) {
        const brandKey = normalizeName(mustHaveItem.name);
        if (!existingBrands.has(brandKey)) {
          // Add must-have item
          const seed: SeedPlace = {
            name: mustHaveItem.name,
            city: mustHaveItem.city,
            mapsUrl: mustHaveItem.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mustHaveItem.name} ${mustHaveItem.city} CA`)}`,
            mapsType: mustHaveItem.mapsType || 'search',
            categoryTags: (mustHaveItem.tags || []).filter((t: string) => t !== 'musthave'),
          };
          filtered.push(seed);
        }
      }
    }
  }
  
  // Step 5: Trim to target size (but ensure minimum)
  if (filtered.length < target.min && category === '新店打卡') {
    // For 新店打卡, if below minimum, be more lenient
    // Add items from must-have file that are new concepts
    const mustHavePath = join(MUSTHAVE_DIR, `${category}.musthave.json`);
    const existingKeys = new Set(filtered.map(item => getCanonicalKey(item.name, item.city)));
    
    if (existsSync(mustHavePath)) {
      const mustHaveContent = readFileSync(mustHavePath, 'utf-8');
      const mustHaveItems: any[] = JSON.parse(mustHaveContent);
      
      for (const mustHaveItem of mustHaveItems) {
        if (filtered.length >= target.min) break;
        
        const key = getCanonicalKey(mustHaveItem.name, mustHaveItem.city);
        if (existingKeys.has(key)) continue;
        
        // Check if it's already in a higher-priority category in original data
        const existing = allPlaces.get(key);
        if (existing && CATEGORY_PRIORITY[existing.category] > CATEGORY_PRIORITY[category]) {
          continue; // Skip if in higher-priority category
        }
        
        // Add if it's marked as new in must-have
        const seed: SeedPlace = {
          name: mustHaveItem.name,
          city: mustHaveItem.city,
          mapsUrl: mustHaveItem.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mustHaveItem.name} ${mustHaveItem.city} CA`)}`,
          mapsType: mustHaveItem.mapsType || 'search',
          categoryTags: (mustHaveItem.tags || []).filter((t: string) => t !== 'musthave'),
        };
        
        // Only add if it's not strongly boba or Chinese
        const isBoba = isBobaTeaPlace(seed);
        const isChinese = (seed.categoryTags || []).some(t => 
          ['sichuan', 'hunan', 'cantonese', 'taiwanese', 'chinese'].includes(t.toLowerCase())
        );
        
        // Allow if it's not strongly boba/Chinese, or if we're still below minimum
        if (!isBoba && !isChinese) {
          filtered.push(seed);
          existingKeys.add(key);
        } else if (filtered.length < target.min - 5) {
          // If we're way below minimum, be more lenient
          filtered.push(seed);
          existingKeys.add(key);
        }
      }
    }
  }
  
  if (filtered.length > target.max) {
    // Sort by priority: must-have > known chains > others
    filtered.sort((a, b) => {
      const aMustHave = category === '奶茶' && MUST_HAVE_BRANDS['奶茶'].some(brand => 
        normalizeName(a.name).includes(normalizeName(brand)) || normalizeName(a.name) === normalizeName(brand)
      );
      const bMustHave = category === '奶茶' && MUST_HAVE_BRANDS['奶茶'].some(brand => 
        normalizeName(b.name).includes(normalizeName(brand)) || normalizeName(b.name) === normalizeName(brand)
      );
      
      if (aMustHave && !bMustHave) return -1;
      if (!aMustHave && bMustHave) return 1;
      
      const aChain = (a.categoryTags || []).some(t => ['chain', 'popular'].includes(t.toLowerCase()));
      const bChain = (b.categoryTags || []).some(t => ['chain', 'popular'].includes(t.toLowerCase()));
      
      if (aChain && !bChain) return -1;
      if (!aChain && bChain) return 1;
      
      return 0;
    });
    
    filtered = filtered.slice(0, target.max);
  }
  
  const finalCount = filtered.length;
  
  return {
    originalCount,
    removedDuplicates,
    removedMisclassified: removedMisclassified.length,
    finalCount,
    items: filtered,
  };
}

function main() {
  console.log('🧹 FINAL CLEANUP: Strict pruning and re-classification\n');
  
  // Step 1: Load all files and build canonical key map
  const allPlaces = new Map<string, { item: SeedPlace; category: SeedCategory; index: number }>();
  const categories: SeedCategory[] = ['奶茶', '中餐', '夜宵', '新店打卡'];
  
  for (const category of categories) {
    const seedPath = join(SEEDS_DIR, `${category}.json`);
    if (existsSync(seedPath)) {
      const seedContent = readFileSync(seedPath, 'utf-8');
      const seedFile: SeedFile = JSON.parse(seedContent);
      
      seedFile.items.forEach((item, index) => {
        const canonicalKey = getCanonicalKey(item.name, item.city);
        const existing = allPlaces.get(canonicalKey);
        
        // Keep the one in the higher-priority category
        if (!existing || CATEGORY_PRIORITY[category] > CATEGORY_PRIORITY[existing.category]) {
          allPlaces.set(canonicalKey, { item, category, index });
        }
      });
    }
  }
  
  console.log(`📊 Total unique places across all categories: ${allPlaces.size}\n`);
  
  // Step 2: Clean each category
  const results: Record<SeedCategory, ReturnType<typeof cleanupCategory>> = {} as any;
  
  for (const category of categories) {
    const result = cleanupCategory(category, allPlaces);
    results[category] = result;
    
    // Write cleaned file
    const seedPath = join(SEEDS_DIR, `${category}.json`);
    const cleanedFile: SeedFile = {
      version: 1,
      category,
      region: 'southbay',
      updatedAt: new Date().toISOString(),
      stage: 'pre-resolve' as any,
      items: result.items.map(item => {
        // Clean structure: remove query field, ensure mapsType
        const cleaned: SeedPlace = {
          name: item.name.trim(),
          city: item.city.trim(),
          mapsUrl: item.mapsUrl.trim(),
          mapsType: item.mapsType || (item.mapsUrl.includes('/place/') ? 'place' : 'search'),
        };
        
        if (item.categoryTags && item.categoryTags.length > 0) {
          cleaned.categoryTags = item.categoryTags.filter(t => t && t.trim().length > 0);
        }
        if (item.placeId) cleaned.placeId = item.placeId;
        if (item.address) cleaned.address = item.address;
        if (item.rating !== undefined) cleaned.rating = item.rating;
        if (item.userRatingCount !== undefined) cleaned.userRatingCount = item.userRatingCount;
        if (item.lat !== undefined) cleaned.lat = item.lat;
        if (item.lng !== undefined) cleaned.lng = item.lng;
        
        return cleaned;
      }),
    };
    
    writeFileSync(seedPath, JSON.stringify(cleanedFile, null, 2), 'utf8');
    
    console.log(`📄 ${category}:`);
    console.log(`   Original: ${result.originalCount}`);
    console.log(`   Removed duplicates: ${result.removedDuplicates}`);
    console.log(`   Removed misclassified: ${result.removedMisclassified}`);
    console.log(`   Final: ${result.finalCount} items`);
    console.log(`   Target: ${CATEGORY_TARGETS[category].min}-${CATEGORY_TARGETS[category].max}`);
    console.log('');
  }
  
  // Step 3: Final cross-category deduplication check
  console.log('🔍 Cross-category deduplication check...\n');
  const finalCanonicalKeys = new Map<string, { category: SeedCategory; name: string; city: string }>();
  let crossCategoryDuplicates = 0;
  
  for (const category of categories) {
    const result = results[category];
    for (const item of result.items) {
      const canonicalKey = getCanonicalKey(item.name, item.city);
      const existing = finalCanonicalKeys.get(canonicalKey);
      
      if (existing) {
        console.log(`   ⚠️  Duplicate found: "${item.name}" in ${item.city}`);
        console.log(`      - In ${existing.category}: "${existing.name}" in ${existing.city}`);
        console.log(`      - Also in ${category}: "${item.name}" in ${item.city}`);
        crossCategoryDuplicates++;
      } else {
        finalCanonicalKeys.set(canonicalKey, { category, name: item.name, city: item.city });
      }
    }
  }
  
  if (crossCategoryDuplicates === 0) {
    console.log('   ✅ No cross-category duplicates found!\n');
  } else {
    console.log(`   ⚠️  Found ${crossCategoryDuplicates} cross-category duplicates\n`);
  }
  
  // Summary
  console.log('📊 Summary:');
  console.log('   Category | Original | Duplicates | Misclassified | Final | Target');
  console.log('   ---------|----------|------------|---------------|-------|-------');
  for (const category of categories) {
    const r = results[category];
    const target = CATEGORY_TARGETS[category];
    console.log(`   ${category.padEnd(8)} | ${String(r.originalCount).padStart(8)} | ${String(r.removedDuplicates).padStart(10)} | ${String(r.removedMisclassified).padStart(13)} | ${String(r.finalCount).padStart(5)} | ${target.min}-${target.max}`);
  }
  
  console.log('\n✅ Final cleanup complete!');
  console.log('   All files marked with stage: "pre-resolve"');
  console.log('   Ready for offline placeId resolution.');
}

main();
