/**
 * Offline Seed Enrichment Script
 * 
 * Enriches seed JSON files with Google Places API data:
 * - placeId
 * - rating
 * - userRatingCount
 * - photoName/photoReference
 * - googleMapsUri
 * 
 * Usage:
 *   pnpm tsx scripts/enrich-seeds-with-places.ts [category|alias|all] [--dry-run] [--max-items=N]
 * 
 * Examples:
 *   pnpm tsx scripts/enrich-seeds-with-places.ts 奶茶
 *   pnpm tsx scripts/enrich-seeds-with-places.ts milk_tea  (alias for 奶茶)
 *   pnpm tsx scripts/enrich-seeds-with-places.ts all --dry-run
 *   pnpm tsx scripts/enrich-seeds-with-places.ts chinese --max-items=5  (alias for 中餐)
 * 
 * Category Aliases:
 *   - milk_tea, bubble_tea → 奶茶
 *   - chinese → 中餐
 *   - late_night, night → 夜宵
 *   - new_places, new → 新店打卡
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load .env file if it exists (before reading env vars)
try {
  const dotenv = await import('dotenv');
  const envPath = path.resolve(PROJECT_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('[Enrich] Loaded .env file');
  } else {
    // Try .env.local as fallback
    const envLocalPath = path.resolve(PROJECT_ROOT, '.env.local');
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath });
      console.log('[Enrich] Loaded .env.local file');
    }
  }
} catch (error) {
  // dotenv not available or error, try to read .env manually
  const envPath = path.resolve(PROJECT_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match && !process.env[match[1]]) {
          const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
          process.env[match[1]] = value;
        }
      }
    }
    console.log('[Enrich] Loaded .env file (manual parsing)');
  }
}

// Configuration
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const PLACES_API_BASE = 'https://places.googleapis.com/v1';
const SOUTH_BAY_CENTER = { lat: 37.3230, lng: -122.0322 };
const RADIUS_METERS = 15000;
const RATE_LIMIT_MS = 1000; // 1 request per second
const CONFIDENCE_THRESHOLD = 0.3; // Minimum score to auto-assign placeId (lowered from 0.4 to allow more matches)

// Paths
const SEEDS_DIR = path.join(PROJECT_ROOT, 'client', 'src', 'lib', 'seeds', 'southbay');
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'places-enrich-cache.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'scripts', 'output');

const CATEGORIES = ['奶茶', '中餐', '夜宵', '新店打卡'] as const;
type Category = typeof CATEGORIES[number];

// Category aliases (for CLI usage, handles encoding issues)
const CATEGORY_ALIASES: Record<string, Category> = {
  'milk_tea': '奶茶',
  'bubble_tea': '奶茶',
  'chinese': '中餐',
  'late_night': '夜宵',
  'night': '夜宵',
  'new_places': '新店打卡',
  'new': '新店打卡',
};

interface SeedPlace {
  name: string;
  city: string;
  mapsUrl: string;
  mapsType: 'place' | 'search';
  categoryTags: string[];
  // Enrichment fields (optional)
  placeId?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  photoName?: string;
  photoReference?: string;
  enrichedAt?: number;
  enrichStatus?: 'ok' | 'unresolved' | 'low_confidence';
  enrichNote?: string;
}

interface SeedFile {
  version?: number;
  category?: string;
  region?: string;
  updatedAt: number | string;
  stage?: string;
  items: SeedPlace[];
}

interface EnrichmentCache {
  [key: string]: {
    placeId?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    photoName?: string;
    photoReference?: string;
    resolvedAt: number;
    confidence?: number;
    status?: 'ok' | 'unresolved' | 'low_confidence';
    note?: string;
  };
}

// Load enrichment cache
function loadCache(): EnrichmentCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[Enrich] Error loading cache:', error);
  }
  return {};
}

// Save enrichment cache
function saveCache(cache: EnrichmentCache): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Enrich] Error saving cache:', error);
  }
}

// Get cache key for a seed item
function getCacheKey(item: SeedPlace): string {
  if (item.placeId) {
    return `place:${item.placeId}`;
  }
  return `seed:${normalize(item.name)}|${normalize(item.city)}`;
}

// Normalize string for matching
function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
}

// Calculate match score between seed item and Places result
function calculateMatchScore(
  seed: SeedPlace,
  place: { displayName?: { text: string }; formattedAddress?: string; googleMapsUri?: string }
): number {
  let score = 0;
  const maxScore = 1.0;

  // Name match (strong weight: 0.5)
  if (place.displayName?.text) {
    const seedNameNorm = normalize(seed.name);
    const placeNameNorm = normalize(place.displayName.text);
    
    if (seedNameNorm === placeNameNorm) {
      score += 0.5; // Exact match
    } else if (placeNameNorm.includes(seedNameNorm) || seedNameNorm.includes(placeNameNorm)) {
      score += 0.3; // Contains match
    }
  }

  // Address contains city (strong weight: 0.3)
  if (place.formattedAddress && seed.city) {
    const addressLower = place.formattedAddress.toLowerCase();
    const cityLower = seed.city.toLowerCase();
    if (addressLower.includes(cityLower)) {
      score += 0.3;
    }
  }

  // Maps URL match (weak weight: 0.2)
  if (seed.mapsUrl && place.googleMapsUri) {
    // Extract place ID from both URLs if possible
    const seedPlaceId = extractPlaceIdFromUrl(seed.mapsUrl);
    const placeId = extractPlaceIdFromUrl(place.googleMapsUri);
    if (seedPlaceId && placeId && seedPlaceId === placeId) {
      score += 0.2;
    }
  }

  return Math.min(score, maxScore);
}

// Extract place ID from Google Maps URL
function extractPlaceIdFromUrl(url: string): string | null {
  // Try to extract from various URL formats
  const patterns = [
    /place[\/=]([^\/\?&]+)/i,
    /cid[=:]([^&]+)/i,
    /data=!3m1!4b1!4m5!3m4!1s([^!]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Resolve placeId using searchText
async function resolvePlaceId(seed: SeedPlace, cache: EnrichmentCache): Promise<{
  placeId: string | null;
  confidence: number;
  placeName?: string;
  address?: string;
  googleMapsUri?: string;
}> {
  const cacheKey = getCacheKey(seed);
  const cached = cache[cacheKey];
  
  // Check cache first
  if (cached?.placeId && cached.status === 'ok') {
    return {
      placeId: cached.placeId,
      confidence: cached.confidence || 1.0,
      googleMapsUri: cached.googleMapsUri,
    };
  }

  // If already marked as unresolved, skip
  if (cached?.status === 'unresolved') {
    return { placeId: null, confidence: 0 };
  }

  try {
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

    const textQuery = `${seed.name} ${seed.city} CA`;
    const url = `${PLACES_API_BASE}/places:searchText`;
    const body = {
      textQuery,
      maxResultCount: 3,
      locationBias: {
        circle: {
          center: {
            latitude: SOUTH_BAY_CENTER.lat,
            longitude: SOUTH_BAY_CENTER.lng,
          },
          radius: RADIUS_METERS,
        },
      },
      // Note: includedTypes is not supported in searchText endpoint
      // Filtering by type happens via textQuery instead
    };

    const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429 || response.status === 403 || errorText.includes('quota')) {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`Places API error: ${response.status}`);
    }

    const data = await response.json();
    const places = data.places || [];

    if (places.length === 0) {
      // Cache as unresolved
      cache[cacheKey] = {
        status: 'unresolved',
        note: 'No results from searchText',
        resolvedAt: Date.now(),
      };
      return { placeId: null, confidence: 0 };
    }

    // Score each candidate
    const candidates = places.map(place => ({
      place,
      score: calculateMatchScore(seed, place),
    })).sort((a, b) => b.score - a.score);

    const bestMatch = candidates[0];
    
    if (bestMatch.score < CONFIDENCE_THRESHOLD) {
      // Low confidence - cache but don't auto-assign
      cache[cacheKey] = {
        status: 'low_confidence',
        note: `Best match score ${bestMatch.score.toFixed(2)} < threshold ${CONFIDENCE_THRESHOLD}`,
        resolvedAt: Date.now(),
      };
      return {
        placeId: null,
        confidence: bestMatch.score,
        placeName: bestMatch.place.displayName?.text,
        address: bestMatch.place.formattedAddress,
        googleMapsUri: bestMatch.place.googleMapsUri,
      };
    }

    // High confidence - cache placeId
    const placeId = bestMatch.place.id;
    cache[cacheKey] = {
      placeId,
      confidence: bestMatch.score,
      googleMapsUri: bestMatch.place.googleMapsUri,
      status: 'ok',
      resolvedAt: Date.now(),
    };

    return {
      placeId,
      confidence: bestMatch.score,
      placeName: bestMatch.place.displayName?.text,
      address: bestMatch.place.formattedAddress,
      googleMapsUri: bestMatch.place.googleMapsUri,
    };
  } catch (error: any) {
    console.error(`[Enrich] Error resolving placeId for ${seed.name}:`, error.message);
    if (error.message === 'QUOTA_EXCEEDED') {
      throw error; // Re-throw to stop processing
    }
    return { placeId: null, confidence: 0 };
  }
}

// Fetch place details
async function fetchPlaceDetails(placeId: string, cache: EnrichmentCache): Promise<{
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  photoName?: string;
  photoReference?: string;
}> {
  const cacheKey = `place:${placeId}`;
  const cached = cache[cacheKey];
  
  // Check cache
  if (cached && cached.rating !== undefined) {
    return {
      rating: cached.rating,
      userRatingCount: cached.userRatingCount,
      googleMapsUri: cached.googleMapsUri,
      photoName: cached.photoName,
      photoReference: cached.photoReference,
    };
  }

  try {
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

    const url = `${PLACES_API_BASE}/places/${placeId}`;
    // For GET /places/{placeId}, fieldMask uses dot notation without "places." prefix
    const fieldMask = 'id,displayName,rating,userRatingCount,formattedAddress,photos,googleMapsUri';

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Enrich] API Error ${response.status} for placeId ${placeId}:`, errorText.substring(0, 300));
      if (response.status === 429 || response.status === 403 || errorText.includes('quota')) {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`Places API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract photo
    let photoName: string | undefined;
    let photoReference: string | undefined;
    if (data.photos && data.photos.length > 0) {
      const firstPhoto = data.photos[0];
      if (firstPhoto.name) {
        photoName = firstPhoto.name;
      } else if (firstPhoto.photoReference) {
        photoReference = firstPhoto.photoReference;
      }
    }

    const result = {
      rating: data.rating ?? undefined,
      userRatingCount: data.userRatingCount ?? undefined,
      googleMapsUri: data.googleMapsUri ?? undefined,
      photoName,
      photoReference,
    };

    // Cache result
    cache[cacheKey] = {
      ...result,
      status: 'ok',
      resolvedAt: Date.now(),
    };

    return result;
  } catch (error: any) {
    console.error(`[Enrich] Error fetching details for ${placeId}:`, error.message);
    if (error.message === 'QUOTA_EXCEEDED') {
      throw error;
    }
    return {};
  }
}

// Enrich a single seed item
async function enrichItem(
  item: SeedPlace,
  cache: EnrichmentCache,
  dryRun: boolean
): Promise<{
  enriched: boolean;
  status: 'ok' | 'unresolved' | 'low_confidence';
  note?: string;
  chosenPlaceName?: string;
  chosenAddress?: string;
  details?: {
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    photoName?: string;
    photoReference?: string;
  };
}> {
  // Skip if already enriched and status is ok
  if (item.enrichStatus === 'ok' && item.placeId && item.rating !== undefined) {
    return { enriched: false, status: 'ok' };
  }

  // Resolve placeId
  const resolution = await resolvePlaceId(item, cache);
  
  if (!resolution.placeId) {
    return {
      enriched: false,
      status: resolution.confidence > 0 ? 'low_confidence' : 'unresolved',
      note: resolution.confidence > 0 
        ? `Low confidence match (${resolution.confidence.toFixed(2)})`
        : 'No place found',
      chosenPlaceName: resolution.placeName,
      chosenAddress: resolution.address,
    };
  }

  // Fetch details
  const details = await fetchPlaceDetails(resolution.placeId, cache);

  if (!dryRun) {
    // Update item in place
    item.placeId = resolution.placeId;
    item.rating = details.rating;
    item.userRatingCount = details.userRatingCount;
    item.googleMapsUri = details.googleMapsUri || resolution.googleMapsUri;
    item.photoName = details.photoName;
    item.photoReference = details.photoReference;
    item.enrichedAt = Date.now();
    item.enrichStatus = 'ok';
    item.enrichNote = undefined;
  }

  return {
    enriched: true,
    status: 'ok',
    chosenPlaceName: resolution.placeName,
    chosenAddress: resolution.address,
    details, // Include details for logging
  };
}

// Load seed file
function loadSeedFile(category: Category): SeedFile {
  const filePath = path.join(SEEDS_DIR, `${category}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  // Ensure items array exists
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error(`Invalid seed file: ${category}.json - missing items array`);
  }
  return parsed;
}

// Save seed file
function saveSeedFile(category: Category, data: SeedFile, dryRun: boolean): void {
  if (dryRun) {
    console.log(`[DRY RUN] Would write ${category}.json`);
    return;
  }

  const filePath = path.join(SEEDS_DIR, `${category}.json`);
  const tempPath = `${filePath}.tmp`;
  
  // Write to temp file first
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  
  // Replace original
  fs.renameSync(tempPath, filePath);
  console.log(`[Enrich] Saved ${category}.json`);
}

// Generate review report
function generateReviewReport(
  category: Category,
  items: SeedPlace[],
  results: Array<{
    name: string;
    city: string;
    status: string;
    note?: string;
    chosenPlaceName?: string;
    chosenAddress?: string;
    googleMapsUri?: string;
    rating?: number;
    userRatingCount?: number;
  }>
): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const reportPath = path.join(OUTPUT_DIR, `enrich-review-${category}.csv`);
  
  const lines = [
    'name,city,chosenPlaceName,chosenAddress,googleMapsUri,rating,userRatingCount,enrichStatus,enrichNote',
    ...results.map(r => [
      `"${r.name}"`,
      `"${r.city}"`,
      `"${r.chosenPlaceName || ''}"`,
      `"${r.chosenAddress || ''}"`,
      `"${r.googleMapsUri || ''}"`,
      r.rating !== undefined ? r.rating : '',
      r.userRatingCount !== undefined ? r.userRatingCount : '',
      r.status,
      `"${r.note || ''}"`,
    ].join(',')),
  ];

  fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');
  console.log(`[Enrich] Review report: ${reportPath}`);
}

// Main enrichment function
async function enrichCategory(
  category: Category,
  options: { dryRun: boolean; maxItems?: number }
): Promise<void> {
  console.log(`\n[Enrich] Starting enrichment for: ${category}`);
  
  const cache = loadCache();
  const seedFile = loadSeedFile(category);
  const items = options.maxItems 
    ? seedFile.items.slice(0, options.maxItems)
    : seedFile.items;

  console.log(`[Enrich] Processing ${items.length} items...`);

  const results: Array<{
    name: string;
    city: string;
    status: string;
    note?: string;
    chosenPlaceName?: string;
    chosenAddress?: string;
    googleMapsUri?: string;
    rating?: number;
    userRatingCount?: number;
  }> = [];

  let enrichedOk = 0;
  let lowConfidence = 0;
  let unresolved = 0;
  let skipped = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`[Enrich] [${i + 1}/${items.length}] ${item.name} (${item.city})`);

    try {
      const result = await enrichItem(item, cache, options.dryRun);
      
      results.push({
        name: item.name,
        city: item.city,
        status: result.status,
        note: result.note,
        chosenPlaceName: result.chosenPlaceName,
        chosenAddress: result.chosenAddress,
        googleMapsUri: item.googleMapsUri,
        rating: result.details?.rating ?? item.rating,
        userRatingCount: result.details?.userRatingCount ?? item.userRatingCount,
      });

      if (result.enriched) {
        enrichedOk++;
        // Show actual fetched data from details (works in both dry-run and real mode)
        const displayRating = result.details?.rating ?? item.rating ?? 'N/A';
        const displayCount = result.details?.userRatingCount ?? item.userRatingCount ?? 'N/A';
        console.log(`  ✓ Enriched: rating=${displayRating}, count=${displayCount}`);
      } else if (result.status === 'low_confidence') {
        lowConfidence++;
        console.log(`  ⚠ Low confidence: ${result.note}`);
      } else if (result.status === 'unresolved') {
        unresolved++;
        console.log(`  ✗ Unresolved: ${result.note}`);
      } else {
        skipped++;
        console.log(`  ⊘ Skipped (already enriched)`);
      }

      // Save cache periodically
      if ((i + 1) % 10 === 0) {
        saveCache(cache);
      }
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        console.error('\n[Enrich] ⚠ QUOTA EXCEEDED - Stopping. Partial progress saved.');
        break;
      }
      console.error(`  ✗ Error: ${error.message}`);
      unresolved++;
    }
  }

  // Final cache save
  saveCache(cache);

  // Save seed file
  if (!options.dryRun) {
    // Preserve existing fields
    seedFile.updatedAt = typeof seedFile.updatedAt === 'string' 
      ? new Date().toISOString() 
      : Date.now();
    saveSeedFile(category, seedFile, options.dryRun);
  }

  // Generate report
  generateReviewReport(category, items, results);

  // Print summary
  console.log(`\n[Enrich] Summary for ${category}:`);
  console.log(`  Total: ${items.length}`);
  console.log(`  ✓ Enriched OK: ${enrichedOk}`);
  console.log(`  ⚠ Low confidence: ${lowConfidence}`);
  console.log(`  ✗ Unresolved: ${unresolved}`);
  console.log(`  ⊘ Skipped: ${skipped}`);
}

// Main
async function main() {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('[Enrich] ERROR: GOOGLE_PLACES_API_KEY environment variable not set');
    console.error('[Enrich] Please set it in .env file or as environment variable');
    console.error('[Enrich] Example: export GOOGLE_PLACES_API_KEY=your_key_here');
    process.exit(1);
  }
  
  console.log(`[Enrich] Using API key: ${GOOGLE_PLACES_API_KEY.substring(0, 10)}...`);

  const args = process.argv.slice(2);
  const categoryArg = args.find(arg => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const maxItemsMatch = args.find(arg => arg.startsWith('--max-items='));
  const maxItems = maxItemsMatch ? parseInt(maxItemsMatch.split('=')[1]) : undefined;

  if (dryRun) {
    console.log('[Enrich] DRY RUN MODE - No files will be modified');
  }

  let categories: Category[] = [];
  if (categoryArg === 'all') {
    categories = [...CATEGORIES];
  } else if (categoryArg) {
    // Try direct match first
    const directMatch = CATEGORIES.find(cat => cat === categoryArg);
    if (directMatch) {
      categories = [directMatch];
    } else {
      // Try alias match
      const aliasMatch = CATEGORY_ALIASES[categoryArg.toLowerCase()];
      if (aliasMatch) {
        categories = [aliasMatch];
      } else {
        // Try fuzzy match (handle encoding issues)
        const normalized = categoryArg.toLowerCase().replace(/[^\w]/g, '');
        for (const [alias, category] of Object.entries(CATEGORY_ALIASES)) {
          if (alias.includes(normalized) || normalized.includes(alias)) {
            categories = [category];
            break;
          }
        }
      }
    }
  }

  if (categories.length === 0) {
    console.error(`[Enrich] Usage: pnpm tsx scripts/enrich-seeds-with-places.ts [category|all] [--dry-run] [--max-items=N]`);
    console.error(`[Enrich] Categories: ${CATEGORIES.join(', ')}`);
    console.error(`[Enrich] Aliases: ${Object.keys(CATEGORY_ALIASES).join(', ')}`);
    if (categoryArg) {
      console.error(`[Enrich] Provided category: "${categoryArg}" (not recognized)`);
      console.error(`[Enrich] Try using an alias instead, e.g., "milk_tea" for "奶茶"`);
    }
    process.exit(1);
  }

  for (const category of categories) {
    try {
      await enrichCategory(category, { dryRun, maxItems });
    } catch (error: any) {
      console.error(`[Enrich] Fatal error for ${category}:`, error);
      if (error.message === 'QUOTA_EXCEEDED') {
        console.error('[Enrich] Quota exceeded - stopping all processing');
        break;
      }
    }
  }

  console.log('\n[Enrich] Done!');
}

main().catch(console.error);
