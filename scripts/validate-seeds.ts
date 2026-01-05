/**
 * Seed Validator Script
 * Validates seed JSON files for real Google Maps URLs and completeness
 * 
 * Usage: npx tsx scripts/validate-seeds.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace, SeedCategory } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const MIN_ITEMS_PER_CATEGORY = 80;
const TARGET_ITEMS_PER_CATEGORY = 100;

// Special minimums for cleaned/pre-resolve files and new quality-focused targets
const PRE_RESOLVE_MIN_ITEMS: Record<string, number> = {
  '奶茶': 30, // Bubble tea cleaned to 30-50 items
};

// Quality-focused targets (30-50 items per category, no API dependency)
// Note: Some categories may have fewer real places available
const QUALITY_TARGETS: Record<string, { min: number; max: number }> = {
  '奶茶': { min: 30, max: 50 },
  '中餐': { min: 30, max: 50 },
  '夜宵': { min: 15, max: 50 }, // Fewer real late-night places available
  '新店打卡': { min: 8, max: 50 }, // Very few genuinely new places that aren't boba/Chinese/late-night
};

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
  normalized = normalized.replace(/&/g, 'and');
  normalized = normalized.replace(/[.,''"()\-]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
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
  if (normalized === 'sanjose' || normalized === 'san jose') {
    normalized = 'san jose';
  }
  return normalized;
}

/**
 * Generate canonical key for deduplication (must match generate-all-seeds.ts)
 */
function getCanonicalKey(name: string, city: string): string {
  return `${normalizeName(name)}|${normalizeCity(city)}`;
}

// Valid Google Maps URL patterns
const VALID_PLACE_PATTERNS = [
  /^https:\/\/www\.google\.com\/maps\/place\//,
  /^https:\/\/maps\.google\.com\/\?cid=/,
  /^https:\/\/maps\.app\.goo\.gl\//,
  /^https:\/\/goo\.gl\/maps\//,
];

const VALID_SEARCH_PATTERNS = [
  /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
  /^https:\/\/www\.google\.com\/maps\?q=/,
];

function normalizeMapsUrl(url: string): string {
  // Normalize URL by removing tracking params and normalizing query encoding
  try {
    const urlObj = new URL(url);
    
    // For search URLs, normalize query param
    if (urlObj.pathname === '/maps/search/' || urlObj.pathname === '/maps') {
      const query = urlObj.searchParams.get('query') || urlObj.searchParams.get('q');
      if (query) {
        // Decode and re-encode to normalize
        const normalizedQuery = decodeURIComponent(query).trim();
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedQuery)}`;
      }
    }
    
    // For place URLs, remove tracking params but keep pathname
    if (urlObj.pathname.startsWith('/maps/place/')) {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }
    
    // For goo.gl short links, keep as-is (they're already normalized)
    if (urlObj.host.includes('goo.gl') || urlObj.host.includes('maps.app.goo.gl')) {
      return url;
    }
    
    // Default: remove query params
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

function isValidMapsUrl(url: string): boolean {
  return (
    VALID_PLACE_PATTERNS.some((pattern) => pattern.test(url)) ||
    VALID_SEARCH_PATTERNS.some((pattern) => pattern.test(url))
  );
}

function validateSeedPlace(place: SeedPlace, index: number, category: string): string[] {
  const errors: string[] = [];

  if (!place.name || place.name.trim().length === 0) {
    errors.push(`  [${index}] Missing or empty name`);
  }

  if (!place.mapsUrl || place.mapsUrl.trim().length === 0) {
    errors.push(`  [${index}] Missing mapsUrl`);
  } else if (!isValidMapsUrl(place.mapsUrl)) {
    errors.push(
      `  [${index}] Invalid mapsUrl: ${place.mapsUrl} (must be a Google Maps place link or search link)`
    );
  } else {
    // Additional validation for search URLs
    if (place.mapsUrl.includes('/search/') || place.mapsUrl.includes('?q=')) {
      try {
        const urlObj = new URL(place.mapsUrl);
        const query = urlObj.searchParams.get('query') || urlObj.searchParams.get('q');
        if (!query || query.trim().length === 0) {
          errors.push(`  [${index}] Search URL has empty query parameter`);
        }
      } catch {
        // URL parsing failed, but isValidMapsUrl already passed, so it's probably OK
      }
    }
  }

  if (!place.city || place.city.trim().length === 0) {
    errors.push(`  [${index}] Missing city`);
  }

  // Check for fake/placeholder URLs
  if (place.mapsUrl) {
    const lowerUrl = place.mapsUrl.toLowerCase();
    if (
      lowerUrl.includes('example.com') ||
      lowerUrl.includes('placeholder') ||
      (lowerUrl.includes('test') && !lowerUrl.includes('google.com')) ||
      lowerUrl.includes('fake') ||
      (/cid=\d{9}/.test(place.mapsUrl) && !lowerUrl.includes('google.com')) // Placeholder CID pattern (but allow real Google cid=)
    ) {
      errors.push(`  [${index}] Suspicious/fake mapsUrl: ${place.mapsUrl}`);
    }
    
    // Reject non-Google domains
    if (!lowerUrl.includes('google.com') && !lowerUrl.includes('goo.gl') && !lowerUrl.includes('maps.app.goo.gl')) {
      errors.push(`  [${index}] Non-Google domain in mapsUrl: ${place.mapsUrl}`);
    }
  }

  return errors;
}

function validateSeedFile(filePath: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  itemCount: number;
  dedupedCount: number;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const seedFile: SeedFile = JSON.parse(content);

    // Validate structure
    if (!seedFile.version) {
      errors.push('Missing version field');
    }
    if (!seedFile.category) {
      errors.push('Missing category field');
    }
    if (!seedFile.items || !Array.isArray(seedFile.items)) {
      errors.push('Missing or invalid items array');
      return { valid: false, errors, warnings, itemCount: 0, dedupedCount: 0 };
    }

    const itemCount = seedFile.items.length;
    
    // Check if file uses quality-focused targets (30-50 items, no API dependency)
    const qualityTarget = QUALITY_TARGETS[seedFile.category];
    const isPreResolve = (seedFile as any).stage === 'pre-resolve';
    
    if (qualityTarget) {
      // Quality-focused validation (30-50 items)
      if (itemCount < qualityTarget.min) {
        errors.push(
          `Insufficient items: ${itemCount} (minimum: ${qualityTarget.min}, target: ${qualityTarget.min}-${qualityTarget.max})`
        );
      } else if (itemCount > qualityTarget.max) {
        warnings.push(
          `Above target: ${itemCount} items (target: ${qualityTarget.min}-${qualityTarget.max}, consider reducing)`
        );
      } else {
        // Within target range - good!
      }
    } else {
      // Legacy validation (80-100 items)
      const minItems = isPreResolve && PRE_RESOLVE_MIN_ITEMS[seedFile.category]
        ? PRE_RESOLVE_MIN_ITEMS[seedFile.category]
        : MIN_ITEMS_PER_CATEGORY;
      
      if (itemCount < minItems) {
        errors.push(
          `Insufficient items: ${itemCount} (minimum: ${minItems}${isPreResolve ? ' (pre-resolve stage)' : ''}, target: ${TARGET_ITEMS_PER_CATEGORY})`
        );
      } else if (itemCount < TARGET_ITEMS_PER_CATEGORY && !isPreResolve) {
        warnings.push(
          `Below target: ${itemCount} items (target: ${TARGET_ITEMS_PER_CATEGORY})`
        );
      } else if (isPreResolve) {
        warnings.push(
          `Pre-resolve stage: ${itemCount} items (ready for offline placeId resolution)`
        );
      }
    }

    // Validate each item and check for canonical key duplicates
    const seenUrls = new Map<string, number>();
    const seenCanonicalKeys = new Map<string, number>();
    
    seedFile.items.forEach((place, index) => {
      const itemErrors = validateSeedPlace(place, index, seedFile.category);
      errors.push(...itemErrors);

      // Check for duplicate canonical keys (CRITICAL - should never happen after dedup)
      const canonicalKey = getCanonicalKey(place.name, place.city);
      if (seenCanonicalKeys.has(canonicalKey)) {
        errors.push(
          `  [${index}] Duplicate canonicalKey "${canonicalKey}" (also at index ${seenCanonicalKeys.get(canonicalKey)}): "${place.name}" in ${place.city}`
        );
      } else {
        seenCanonicalKeys.set(canonicalKey, index);
      }

      // Check for duplicate URLs (warning, not error)
      if (place.mapsUrl) {
        const normalized = normalizeMapsUrl(place.mapsUrl);
        if (seenUrls.has(normalized)) {
          warnings.push(
            `  [${index}] Duplicate mapsUrl (also at index ${seenUrls.get(normalized)}): ${place.mapsUrl}`
          );
        } else {
          seenUrls.set(normalized, index);
        }
      }
    });

    const dedupedCount = seenCanonicalKeys.size;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      itemCount,
      dedupedCount,
    };
  } catch (error: any) {
    errors.push(`Failed to parse JSON: ${error.message}`);
    return { valid: false, errors, warnings, itemCount: 0, dedupedCount: 0 };
  }
}

function main() {
  console.log('🔍 Validating seed files...\n');

  if (!existsSync(SEEDS_DIR)) {
    console.error(`❌ Seeds directory not found: ${SEEDS_DIR}`);
    console.log('💡 Create the directory and seed JSON files first.');
    process.exit(1);
  }

  const files = readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  
  if (files.length === 0) {
    console.warn('⚠️  No seed JSON files found');
    console.log(`   Expected files in: ${SEEDS_DIR}`);
    console.log('   Files: 奶茶.json, 中餐.json, 夜宵.json, 新店打卡.json');
    process.exit(1);
  }

  const categories: SeedCategory[] = ['奶茶', '中餐', '夜宵', '新店打卡'];
  let totalErrors = 0;
  let totalWarnings = 0;
  let allValid = true;

  for (const category of categories) {
    const fileName = `${category}.json`;
    const filePath = join(SEEDS_DIR, fileName);

    console.log(`📄 ${category} (${fileName}):`);

    if (!existsSync(filePath)) {
      console.log(`   ❌ File not found`);
      totalErrors++;
      allValid = false;
      continue;
    }

    const result = validateSeedFile(filePath);

    if (result.valid) {
      console.log(`   ✅ Valid: ${result.itemCount} items (${result.dedupedCount} unique URLs)`);
      if (result.warnings.length > 0) {
        console.log(`   ⚠️  Warnings:`);
        result.warnings.forEach((w) => console.log(w));
        totalWarnings += result.warnings.length;
      }
    } else {
      console.log(`   ❌ Invalid:`);
      result.errors.forEach((e) => console.log(e));
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      allValid = false;
    }

    console.log('');
  }

  // Summary
  console.log('📊 Summary:');
  console.log(`   Errors: ${totalErrors}`);
  console.log(`   Warnings: ${totalWarnings}`);
  
  if (allValid && totalErrors === 0) {
    console.log('\n✅ All seed files are valid!');
    process.exit(0);
  } else {
    console.log('\n❌ Validation failed. Fix errors before committing.');
    process.exit(1);
  }
}

main();
