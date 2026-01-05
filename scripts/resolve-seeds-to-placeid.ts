/**
 * One-time offline script to resolve seed places to placeId and exact Google Maps URIs
 * 
 * This script:
 * - Uses Google Places API Text Search (New) to resolve each seed
 * - Caches results to avoid re-querying
 * - Rate limits to 5 req/sec
 * - Only updates seeds with high confidence matches
 * - Rewrites seed JSON files in-place
 * 
 * Usage: npx tsx scripts/resolve-seeds-to-placeid.ts
 * 
 * Requirements:
 * - GOOGLE_PLACES_API_KEY environment variable must be set
 * - Run manually (NOT on app load)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const CACHE_DIR = join(process.cwd(), '.cache');
const CACHE_FILE = join(CACHE_DIR, 'places_resolve_cache.json');

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// Rate limiting: 5 req/sec = 200ms between requests
const RATE_LIMIT_MS = 200;

// South Bay center for location bias
const SOUTH_BAY_CENTER = {
  lat: 37.3382,
  lng: -121.8863,
};

// Confidence threshold (0-100)
const MIN_CONFIDENCE_SCORE = 70;

interface ResolveCache {
  [key: string]: {
    placeId?: string;
    googleMapsUri?: string;
    address?: string;
    confidence?: number;
    resolvedAt?: string;
    error?: string;
  };
}

interface PlacesTextSearchResponse {
  places?: Array<{
    id: string;
    displayName: { text: string };
    formattedAddress: string;
    googleMapsUri: string;
  }>;
}

/**
 * Load or create cache
 */
function loadCache(): ResolveCache {
  if (existsSync(CACHE_FILE)) {
    try {
      const content = readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`[Resolve] Failed to load cache: ${error}`);
      return {};
    }
  }
  return {};
}

/**
 * Save cache
 */
function saveCache(cache: ResolveCache): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * Normalize name for matching (same as generate-all-seeds.ts)
 */
function normalizeName(name: string): string {
  let normalized = name.trim().toLowerCase();
  normalized = normalized.replace(/&/g, 'and');
  normalized = normalized.replace(/[.,''"()\-]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Score a candidate place match
 */
function scoreMatch(seed: SeedPlace, candidate: PlacesTextSearchResponse['places'][0]): number {
  let score = 0;
  
  const seedNameNormalized = normalizeName(seed.name);
  const candidateNameNormalized = normalizeName(candidate.displayName.text);
  
  // Exact name match (normalized)
  if (seedNameNormalized === candidateNameNormalized) {
    score += 50;
  } else if (candidateNameNormalized.includes(seedNameNormalized) || seedNameNormalized.includes(candidateNameNormalized)) {
    score += 30; // Partial match
  } else {
    return 0; // No name match = low confidence
  }
  
  // Address contains city
  const cityLower = seed.city.toLowerCase();
  if (candidate.formattedAddress.toLowerCase().includes(cityLower)) {
    score += 30;
  }
  
  // Address hint match (if provided)
  if (seed.address && candidate.formattedAddress.toLowerCase().includes(seed.address.toLowerCase())) {
    score += 20;
  }
  
  return Math.min(100, score);
}

/**
 * Resolve a single seed to placeId using Places Text Search
 */
async function resolveSeed(seed: SeedPlace, cache: ResolveCache): Promise<{
  placeId?: string;
  googleMapsUri?: string;
  address?: string;
  confidence?: number;
  error?: string;
}> {
  // Check cache first
  const cacheKey = `${seed.name}|${seed.city}`;
  const cached = cache[cacheKey];
  if (cached && (cached.placeId || cached.error)) {
    return cached;
  }
  
  if (!GOOGLE_PLACES_API_KEY) {
    return { error: 'GOOGLE_PLACES_API_KEY not set' };
  }
  
  try {
    const textQuery = `${seed.name} ${seed.city} CA`;
    const url = `${PLACES_API_BASE}/places:searchText`;
    
    const requestBody = {
      textQuery,
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: {
            latitude: SOUTH_BAY_CENTER.lat,
            longitude: SOUTH_BAY_CENTER.lng,
          },
          radius: 50000, // 50km radius
        },
      },
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Check for quota exceeded
      if (response.status === 429 || response.status === 403 || errorText.includes('quota') || errorText.includes('QUOTA')) {
        console.error(`[Resolve] QUOTA_EXCEEDED - stopping resolution`);
        throw new Error('QUOTA_EXCEEDED');
      }
      
      const error = `HTTP ${response.status}: ${errorText.substring(0, 100)}`;
      cache[cacheKey] = { error, resolvedAt: new Date().toISOString() };
      return { error };
    }
    
    const data: PlacesTextSearchResponse = await response.json();
    
    if (!data.places || data.places.length === 0) {
      const error = 'No places found';
      cache[cacheKey] = { error, resolvedAt: new Date().toISOString() };
      return { error };
    }
    
    // Score all candidates and pick best
    let bestCandidate: PlacesTextSearchResponse['places'][0] | null = null;
    let bestScore = 0;
    
    for (const candidate of data.places) {
      const score = scoreMatch(seed, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
    
    if (!bestCandidate || bestScore < MIN_CONFIDENCE_SCORE) {
      const error = `Low confidence (${bestScore} < ${MIN_CONFIDENCE_SCORE})`;
      cache[cacheKey] = { error, confidence: bestScore, resolvedAt: new Date().toISOString() };
      return { error, confidence: bestScore };
    }
    
    // High confidence match - return resolved data
    const result = {
      placeId: bestCandidate.id,
      googleMapsUri: bestCandidate.googleMapsUri,
      address: bestCandidate.formattedAddress,
      confidence: bestScore,
    };
    
    cache[cacheKey] = { ...result, resolvedAt: new Date().toISOString() };
    return result;
    
  } catch (error: any) {
    if (error.message === 'QUOTA_EXCEEDED') {
      throw error; // Re-throw to stop processing
    }
    
    const errorMsg = error.message || 'Unknown error';
    cache[cacheKey] = { error: errorMsg, resolvedAt: new Date().toISOString() };
    return { error: errorMsg };
  }
}

/**
 * Resolve all seeds in a category file
 */
async function resolveSeedFile(category: '奶茶' | '中餐' | '夜宵' | '新店打卡', cache: ResolveCache): Promise<{
  resolved: number;
  unresolved: number;
  errors: number;
}> {
  const filePath = join(SEEDS_DIR, `${category}.json`);
  
  if (!existsSync(filePath)) {
    console.warn(`[Resolve] File not found: ${filePath}`);
    return { resolved: 0, unresolved: 0, errors: 0 };
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const seedFile: SeedFile = JSON.parse(content);
  
  console.log(`\n📄 Resolving ${category} (${seedFile.items.length} items)...`);
  
  let resolved = 0;
  let unresolved = 0;
  let errors = 0;
  
  for (let i = 0; i < seedFile.items.length; i++) {
    const seed = seedFile.items[i];
    
    // Skip if already resolved
    if (seed.placeId && seed.mapsType === 'place') {
      console.log(`  [${i + 1}/${seedFile.items.length}] ✅ Already resolved: ${seed.name}`);
      resolved++;
      continue;
    }
    
    console.log(`  [${i + 1}/${seedFile.items.length}] Resolving: ${seed.name} (${seed.city})...`);
    
    try {
      const result = await resolveSeed(seed, cache);
      
      if (result.error) {
        console.log(`    ❌ ${result.error}${result.confidence ? ` (confidence: ${result.confidence})` : ''}`);
        unresolved++;
        errors++;
      } else if (result.placeId && result.googleMapsUri) {
        // Update seed with resolved data
        seed.placeId = result.placeId;
        seed.mapsUrl = result.googleMapsUri;
        seed.mapsType = 'place';
        if (result.address) {
          seed.address = result.address;
        }
        console.log(`    ✅ Resolved: ${result.placeId.substring(0, 20)}... (confidence: ${result.confidence})`);
        resolved++;
      }
      
      // Rate limiting
      if (i < seedFile.items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
      }
      
      // Save cache periodically (every 10 items)
      if ((i + 1) % 10 === 0) {
        saveCache(cache);
      }
      
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        console.error(`\n❌ QUOTA_EXCEEDED - stopping resolution`);
        saveCache(cache);
        throw error;
      }
      console.error(`    ❌ Error: ${error.message}`);
      errors++;
    }
  }
  
  // Write updated seed file
  writeFileSync(filePath, JSON.stringify(seedFile, null, 2), 'utf8');
  console.log(`  ✅ Updated ${filePath}`);
  
  return { resolved, unresolved, errors };
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Resolving seeds to placeId...\n');
  
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY environment variable not set');
    console.log('💡 Set it before running this script:');
    console.log('   export GOOGLE_PLACES_API_KEY=your_key_here');
    process.exit(1);
  }
  
  const cache = loadCache();
  console.log(`📦 Loaded cache: ${Object.keys(cache).length} entries`);
  
  const categories: Array<'奶茶' | '中餐' | '夜宵' | '新店打卡'> = ['奶茶', '中餐', '夜宵', '新店打卡'];
  
  let totalResolved = 0;
  let totalUnresolved = 0;
  let totalErrors = 0;
  
  try {
    for (const category of categories) {
      const result = await resolveSeedFile(category, cache);
      totalResolved += result.resolved;
      totalUnresolved += result.unresolved;
      totalErrors += result.errors;
    }
    
    // Final cache save
    saveCache(cache);
    
    console.log('\n📊 Summary:');
    console.log(`   Resolved: ${totalResolved}`);
    console.log(`   Unresolved: ${totalUnresolved}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Cache entries: ${Object.keys(cache).length}`);
    
    console.log('\n✅ Resolution complete!');
    
  } catch (error: any) {
    if (error.message === 'QUOTA_EXCEEDED') {
      console.error('\n❌ QUOTA_EXCEEDED - partial progress saved to cache');
      console.log('💡 Wait 24 hours or increase quota, then re-run to continue');
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
