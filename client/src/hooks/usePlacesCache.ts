/**
 * Hook for managing Places data with local cache
 * Implements client-side persistent cache with IndexedDB
 */

import { useState, useEffect, useCallback } from 'react';
import { get } from 'idb-keyval';
import {
  getPool,
  setPool,
  isStale,
  getCacheAgeDays,
  isInCooldown,
  setCooldown,
  getRotationCursor,
  setRotationCursor,
  rotatePlaces,
  createPool,
  getSeedPool,
  loadSeedFile,
  getNewPlacesPool as getNewPlacesPoolFromCache,
  setNewPlacesPool as setNewPlacesPoolToCache,
  clearNewPlacesPool,
  clearAllPools,
  type CachedPool,
  type CachedPlace,
} from '@/lib/places/localCache';
import { curatePlaces, type CategoryKey } from '@/lib/places/curation/curatePlaces';
import { getRegionProfile } from '@/lib/places/curation/regionProfiles';
import { config } from '@/config';
import { NEW_PLACES_TTL_DAYS, NEW_PLACES_COOLDOWN_DAYS } from '@/config/places';
import { loadMusthavePlaceIds, MUSTHAVE_VERSION_KEY } from '@/lib/musthave/loadMusthave';

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
  photo_url?: string;
  photo_local_url?: string;
  maps_url: string;
  city: string;
  score?: number;
  badges?: string[];
}

interface PlacesCacheInfo {
  mode: 'live' | 'cache' | 'seed';
  cacheAgeDays?: number;
  poolSize?: number;
  refreshAttempted?: boolean;
}

interface PlacesDebugInfo {
  region?: string;
  tiersUsed?: number;
  excludedSamples?: Array<{ name: string; reason: string; types?: string[] }>;
  includedBreakdown?: Record<string, any>;
}

/**
 * Convert API response to cached place format
 */
function apiPlaceToCached(place: SpendPlace): CachedPlace {
  return {
    placeId: place.id,
    name: place.name,
    rating: place.rating,
    userRatingCount: place.user_ratings_total,
    address: '', // Can extract from maps_url if needed
    mapsUrl: place.maps_url,
    lat: undefined, // Can calculate if needed
    lng: undefined,
    photoRef: place.photo_url,
    photoLocalUrl: place.photo_local_url,
  };
}

/**
 * Convert cached place to SpendPlace format
 */
function cachedPlaceToSpend(cached: CachedPlace, category: string, city: string): SpendPlace {
  // Use cached.city if available (from seed data), otherwise use provided city
  const finalCity = cached.city || city;
  
  // Prefer local cached photo; avoid hitting Google Photos at runtime
  const photo_local_url = cached.photoLocalUrl || (cached.photoRef?.startsWith('/') ? cached.photoRef : undefined);
  const photo_url = photo_local_url;
  
  const result: SpendPlace = {
    id: cached.placeId,
    name: cached.name,
    category,
    rating: cached.rating,
    user_ratings_total: cached.userRatingCount,
    distance_miles: undefined,
    photo_url,
    photo_local_url,
    maps_url: cached.mapsUrl,
    city: finalCity, // Preserve city from seed data
  };
  
  return result;
}

/**
 * Filter places for category from pools
 */
const SOUTH_BAY_CITIES = ['cupertino', 'sunnyvale', 'santa clara', 'mountain view', 'milpitas', 'san jose'];
const MILK_TEA_NAME_EXCLUSIONS = ['bowl', 'bowling', 'bar', 'pub', 'lounge', 'casino', 'steak', 'grill', 'brew', 'roast', 'coffee'];
const TYPE_EXCLUSIONS = new Set([
  "bowling_alley",
  "bar",
  "night_club",
  "sports_complex",
  "casino",
  "amusement_center",
  "movie_theater",
  "shopping_mall",
  "department_store",
]);

const SOUTH_BAY_MILK_TEA_WHITELIST = [
  "yi fang", "yifang",
  "heytea",
  "nayuki", "naixue",
  "chagee",
  "the alley",
  "tiger sugar",
  "coco", "coco fresh",
  "gong cha", "贡茶",
  "tp tea", "天仁茗茶",
  "happy lemon",
  "sunright tea studio",
  "teaspoon",
  "wow tea",
  "shu shia",
  "ume tea",
  "wanpo tea shop",
  "molly tea",
  "shuyi tealicious",
  "chicha san chen",
];

const CN_MILK_TEA_BRANDS = [
  "yi fang", "yifang",
  "heytea",
  "nayuki", "naixue",
  "tiger sugar",
  "the alley",
  "coco", "gong cha", "贡茶",
  "chagee",
  "蜜雪冰城",
  "tp tea", "天仁茗茶",
  "happy lemon",
  "sunright tea studio",
  "teaspoon",
];

const SOUTH_BAY_CHINESE_RESTAURANT_WHITELIST = [
  "haidilao",
  "da long yi",
  "shancheng lameizi",
  "little sheep",
  "sichuan impression",
  "spicy house",
  "chongqing xiao mian",
  "cooking papa",
  "tai pan",
  "hong kong bistro",
  "saigon seafood harbor",
  "qq noodle",
  "ox 9 lanzhou handpulled noodles",
  "lanzhou beef noodle",
  "north china restaurant",
  "din tai fung",
  "dough zone",
  "chef chu's",
];

const SOUTH_BAY_LATE_NIGHT_WHITELIST = [
  "chongqing xiao mian",
  "spicy city",
  "da long yi",
  "lanzhou beef noodle",
  "ox 9 lanzhou handpulled noodles",
  "chuan skewers",
  "chuan wei zhen",
];

const SOUTH_BAY_NEW_OPENING_WHITELIST = [
  "chagee",
  "nayuki",
  "heytea",
  "palette tea house",
  "ox 9",
];

const MILK_TEA_POS_KEYWORDS = ['milk tea', 'boba', 'bubble tea', 'tea', '奶茶', '珍珠', '黑糖', '芝士'];
const MILK_TEA_NEG_KEYWORDS = ['coffee', 'smoothie', 'juice', 'dessert', 'ice cream'];
const MILK_TEA_POS_TYPES = ['bubble_tea', 'tea_house'];
const CHINESE_CHAR_REGEX = /[\p{Script=Han}]/u;

function containsChineseCharacters(text?: string): boolean {
  if (!text) return false;
  return CHINESE_CHAR_REGEX.test(text);
}

function isMilkTeaName(name: string): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  const mentionInList = SOUTH_BAY_MILK_TEA_WHITELIST.some((brand) => normalized.includes(brand));
  if (mentionInList) return true;
  return CN_MILK_TEA_BRANDS.some((brand) => normalized.includes(brand));
}

function isLateNightName(name: string): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return normalized.includes('hot pot') ||
         normalized.includes('hotpot') ||
         normalized.includes('bbq') ||
         normalized.includes('malatang') ||
         normalized.includes('mala') ||
         normalized.includes('skewers') ||
         normalized.includes('yang guo fu') ||
         normalized.includes('haidilao') ||
         normalized.includes('liuyishou') ||
         normalized.includes('dynasty bbq') ||
         normalized.includes('chef yang') ||
         normalized.includes('tan suo') ||
         normalized.includes('phoenix bbq') ||
         normalized.includes('fat ni') ||
         normalized.includes('bbq king') ||
         normalized.includes('wu ji') ||
         normalized.includes('xiyue') ||
         normalized.includes('old river');
}

type MilkTeaMeta = {
  brandSB: boolean;
  brandGeneral: boolean;
  positiveMatch: boolean;
  negativeMatch: boolean;
  hasChineseSignal: boolean;
  typeMatches: boolean;
  score: number;
  badges: string[];
};

function isSouthBayPlace(place: CachedPlace, city: string): boolean {
  const cityLower = (place.city || city || '').toLowerCase();
  return SOUTH_BAY_CITIES.some((c) => cityLower.includes(c));
}

function hasHardExclusion(nameLower: string, types: string[]): string | null {
  if (types.some((type) => TYPE_EXCLUSIONS.has(type))) return 'excluded_by_type';
  if (MILK_TEA_NAME_EXCLUSIONS.some((keyword) => nameLower.includes(keyword))) return 'excluded_by_name';
  return null;
}

function buildMilkTeaMeta(place: CachedPlace, isSouthBay: boolean): MilkTeaMeta {
  const nameLower = place.name.toLowerCase();
  const addressLower = place.address?.toLowerCase() || '';
  const combined = `${nameLower} ${addressLower}`;
  const brandSB = SOUTH_BAY_MILK_TEA_WHITELIST.some((brand) => combined.includes(brand));
  const brandGeneral = CN_MILK_TEA_BRANDS.some((brand) => combined.includes(brand));
  const positiveMatch =
    MILK_TEA_POS_KEYWORDS.some((keyword) => combined.includes(keyword)) ||
    (place as any).categories?.some((category: string) =>
      MILK_TEA_POS_TYPES.includes(category.toLowerCase())
    ) ||
    (place as any).types?.some((type: string) =>
      MILK_TEA_POS_TYPES.includes(type.toLowerCase())
    );
  const negativeMatch = MILK_TEA_NEG_KEYWORDS.some((keyword) => combined.includes(keyword));
  const hasChineseSignal = containsChineseCharacters(`${place.name} ${place.address}`);
  const reviewCount = place.userRatingCount ?? 0;
  const rating = place.rating ?? 0;
  const baseScore = Math.log(reviewCount + 1) * 10 + (rating - 4.0) * 5;
  let priors = 0;
  if (brandSB) priors += 100;
  if (!brandSB && brandGeneral) priors += 40;
  if (hasChineseSignal) priors += 20;
  if (typeMatches) priors += 15;
  if (reviewCount > 500) priors += 10;
  const score = baseScore + priors;
  const badges: string[] = [];
  if (brandSB || brandGeneral) badges.push('品牌店');
  if (reviewCount > 500) badges.push('老牌');
  if (hasChineseSignal) badges.push('华人常去');

  const types = [
    ...((place as any).types || []),
    ...((place as any).categories || []),
  ].map((type: string) => String(type).toLowerCase());
  const typeMatches = types.some((type) => MILK_TEA_POS_TYPES.includes(type));

  return {
    brandSB,
    brandGeneral,
    positiveMatch: brandSB || brandGeneral || positiveMatch,
    negativeMatch,
    hasChineseSignal,
    typeMatches,
    score,
    badges,
  };
}

type ScoreMeta = {
  score: number;
  badges?: string[];
};

function filterPlacesForCategory(
  restaurantPool: CachedPool | null,
  cafePool: CachedPool | null,
  category: '奶茶' | '中餐' | '夜宵' | '新店打卡',
  city: string,
  relaxed: boolean = false
): SpendPlace[] {
  let sourcePool: CachedPool | null;
  let filterFn: (place: CachedPlace) => boolean;
  let scoreFn: (place: CachedPlace) => ScoreMeta;
  const filteredOutLogs: { name: string; reason: string }[] = [];

  switch (category) {
    case '奶茶':
      sourcePool = cafePool;
      if (relaxed) {
        filterFn = () => true;
      } else {
        filterFn = (p) => {
          const nameLower = p.name.toLowerCase();
          const types = [
            ...((p as any).types || []),
            ...((p as any).categories || []),
          ].map((type: string) => String(type).toLowerCase());

          const exclusionReason = hasHardExclusion(nameLower, types);
          if (exclusionReason) {
            if (filteredOutLogs.length < 10) {
              filteredOutLogs.push({ name: p.name, reason: exclusionReason });
            }
            return false;
          }

          const meta = buildMilkTeaMeta(p, isSouthBayPlace(p, city));
          const positiveSignal = meta.brandSB || meta.brandGeneral || meta.positiveMatch || meta.typeMatches;
          if (!positiveSignal) {
            if (filteredOutLogs.length < 10) {
              filteredOutLogs.push({ name: p.name, reason: 'missing_positive_signal' });
            }
            return false;
          }

          return !meta.negativeMatch;
        };
      }
      scoreFn = (p) => {
        const meta = buildMilkTeaMeta(p, isSouthBayPlace(p, city));
        return { score: meta.score, badges: meta.badges };
      };
      break;

    case '中餐':
      sourcePool = restaurantPool;
      if (relaxed) {
        filterFn = () => true; // Accept all restaurants
      } else {
        filterFn = (p) => {
          const nameLower = p.name.toLowerCase();
          const types = [
            ...((p as any).types || []),
            ...((p as any).categories || []),
          ].map((type: string) => String(type).toLowerCase());
          const exclusionReason = hasHardExclusion(nameLower, types);
          if (exclusionReason) return false;

          const isSouthBay = isSouthBayPlace(p, city);
          const chineseSignals = (
            nameLower.includes('chinese') ||
            nameLower.includes('szechuan') ||
            nameLower.includes('hunan') ||
            nameLower.includes('cantonese') ||
            nameLower.includes('hot pot') ||
            nameLower.includes('noodle') ||
            CHINESE_CHAR_REGEX.test(p.name) ||
            nameLower.includes('中餐') ||
            nameLower.includes('川菜') ||
            nameLower.includes('湘菜') ||
            nameLower.includes('火锅') ||
            nameLower.includes('面')
          );
          const whitelistMatch = SOUTH_BAY_CHINESE_RESTAURANT_WHITELIST.some((w) => nameLower.includes(w.toLowerCase()));

          if (isSouthBay) {
            return whitelistMatch || chineseSignals;
          }

          return chineseSignals;
        };
      }
      scoreFn = (p) => {
        const isSouthBay = isSouthBayPlace(p, city);
        const nameLower = p.name.toLowerCase();
        const reviewCount = p.userRatingCount ?? 0;
        const rating = p.rating ?? 0;
        const baseScore = Math.log(reviewCount + 1) * 10 + (rating - 4.0) * 5;
        let score = baseScore;
        if (isSouthBay) {
          const whitelist = SOUTH_BAY_CHINESE_RESTAURANT_WHITELIST.some((w) => nameLower.includes(w.toLowerCase()));
          if (whitelist) score += 100;
          else if (CHINESE_CHAR_REGEX.test(p.name)) score += 20;
          if (reviewCount > 500) score += 10;
          const fusion = nameLower.includes('fusion');
          const dessertOnly = nameLower.includes('dessert');
          if (fusion) score -= 30;
          if (dessertOnly) score -= 20;
        }
        return { score };
      };
      break;

    case '夜宵':
      sourcePool = restaurantPool;
      if (relaxed) {
        filterFn = () => true; // Accept all restaurants
      } else {
        // Initial filter: name-based heuristics (opening hours filtering happens in component after enrichment)
        filterFn = (p) => {
          const nameLower = p.name.toLowerCase();
          const types = [
            ...((p as any).types || []),
            ...((p as any).categories || []),
          ].map((type: string) => String(type).toLowerCase());
          const exclusionReason = hasHardExclusion(nameLower, types);
          if (exclusionReason) return false;

          const isSouthBay = isSouthBayPlace(p, city);
          const lateNightKeywords =
            nameLower.includes('hot pot') ||
            nameLower.includes('bbq') ||
            nameLower.includes('烧烤') ||
            nameLower.includes('火锅') ||
            nameLower.includes('ramen') ||
            nameLower.includes('pho') ||
            nameLower.includes('izakaya') ||
            nameLower.includes('拉面') ||
            nameLower.includes('串');
          const whitelistMatch = SOUTH_BAY_LATE_NIGHT_WHITELIST.some((w) => nameLower.includes(w.toLowerCase()));

          if (isSouthBay) {
            return whitelistMatch || lateNightKeywords || CHINESE_CHAR_REGEX.test(p.name);
          }
          return lateNightKeywords;
        };
      }
      scoreFn = (p) => {
        const isSouthBay = isSouthBayPlace(p, city);
        const nameLower = p.name.toLowerCase();
        const reviewCount = p.userRatingCount ?? 0;
        const rating = p.rating ?? 0;
        const baseScore = Math.log(reviewCount + 1) * 10 + (rating - 4.0) * 5;
        let score = baseScore;
        if (isSouthBay) {
          const whitelist = SOUTH_BAY_LATE_NIGHT_WHITELIST.some((w) => nameLower.includes(w.toLowerCase()));
          if (whitelist) score += 100;
          if (CHINESE_CHAR_REGEX.test(p.name)) score += 20;
          if (reviewCount > 500) score += 10;
          const fusion = nameLower.includes('fusion');
          const dessertOnly = nameLower.includes('dessert');
          if (fusion) score -= 30;
          if (dessertOnly) score -= 20;
        }
        return { score };
      };
      break;

    case '新店打卡':
      // New openings: South Bay only, first review within 6 months
      const combinedPlaces: CachedPlace[] = [];
      if (restaurantPool) combinedPlaces.push(...restaurantPool.items);
      if (cafePool) combinedPlaces.push(...cafePool.items);
      const deduped = Array.from(new Map(combinedPlaces.map((p) => [p.placeId, p])).values());
      sourcePool = deduped.length > 0 ? createPool(deduped, restaurantPool?.sourceMode || 'cache') : null;
      if (relaxed) {
        filterFn = (p) => {
          const isSouthBay = isSouthBayPlace(p, city);
          return isSouthBay && p.rating >= 3.5;
        };
      } else {
        filterFn = (p) => {
          // Must be South Bay
          const isSouthBay = isSouthBayPlace(p, city);
          if (!isSouthBay) return false;

          const nameLower = p.name.toLowerCase();
          const types = [
            ...((p as any).types || []),
            ...((p as any).categories || []),
          ].map((type: string) => String(type).toLowerCase());
          const exclusionReason = hasHardExclusion(nameLower, types);
          if (exclusionReason) return false;

          // Basic criteria for potential new places
          const reviewOK = p.userRatingCount < 200 && p.rating >= 3.8;
          const sbWhitelist = SOUTH_BAY_NEW_OPENING_WHITELIST.some((w) => nameLower.includes(w.toLowerCase()));
          const chineseSignal = CHINESE_CHAR_REGEX.test(p.name);

          return reviewOK || sbWhitelist || chineseSignal;
        };
      }
      scoreFn = (p) => {
        const newnessScore = 100 - Math.min(p.userRatingCount, 100);
        let score = newnessScore + (p.rating * 10);
        const nameLower = p.name.toLowerCase();
        if (SOUTH_BAY_NEW_OPENING_WHITELIST.some((w) => nameLower.includes(w.toLowerCase()))) {
          score += 60;
        }
        if (CHINESE_CHAR_REGEX.test(p.name)) score += 20;
        return { score };
      };
      break;

    default:
      return [];
  }

  if (!sourcePool || sourcePool.items.length === 0) return [];

  // Filter and convert
  const filtered = sourcePool.items
    .filter(filterFn)
    .map((p) => {
      const { score, badges } = scoreFn(p);
      return {
        ...cachedPlaceToSpend(p, category, city),
        score,
        badges,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (category === '奶茶' && filteredOutLogs.length > 0) {
    console.debug(
      `[奶茶 filter] filtered out ${filteredOutLogs.length} items`,
      filteredOutLogs
    );
  }

  return filtered;
}

/**
 * Manual refresh: Fetch South Bay places from API and cache them
 * ONLY called via manual refresh button (never on page load)
 * Performs exactly 2 API calls: restaurant + cafe
 */
export async function refreshSouthBayPlaces(): Promise<{
  success: boolean;
  restaurantCount: number;
  cafeCount: number;
  error?: string;
}> {
  // South Bay centroid (Cupertino center as representative)
  const SOUTH_BAY_CENTER = { lat: 37.3230, lng: -122.0322 };
  const RADIUS_METERS = 15000; // ~9.3 miles to cover South Bay

  try {
    // Check cooldown
    const inCooldown = await isInCooldown();
    if (inCooldown) {
      return {
        success: false,
        restaurantCount: 0,
        cafeCount: 0,
        error: 'In cooldown period (quota exceeded recently)',
      };
    }

    // Call optimized API endpoint (which uses placesClient internally)
    // The endpoint will make exactly 2 calls: restaurant + cafe
    const apiUrl = `${config.apiBaseUrl}/api/spend/today?manual_refresh=1`;
    
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 403) {
        await setCooldown(7);
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const placesByCategory = data.itemsByCategory || {};

    // Extract all places and group by pool type
    const restaurantPlaces: CachedPlace[] = [];
    const cafePlaces: CachedPlace[] = [];

    const categoryMap: Record<string, string> = {
      'milk_tea': '奶茶',
      'chinese': '中餐',
      'late_night': '夜宵',
      'new_places': '新店打卡',
    };

    for (const [categoryKey, places] of Object.entries(placesByCategory)) {
      const category = categoryMap[categoryKey] || categoryKey;
      for (const place of places as SpendPlace[]) {
        const cached = apiPlaceToCached(place);
        if (category === '奶茶') {
          cafePlaces.push(cached);
        } else {
          restaurantPlaces.push(cached);
        }
      }
    }

    // Deduplicate
    const restaurantDeduped = Array.from(
      new Map(restaurantPlaces.map((p) => [p.placeId, p])).values()
    );
    const cafeDeduped = Array.from(
      new Map(cafePlaces.map((p) => [p.placeId, p])).values()
    );


    // Create and cache pools
    const restaurantPool = createPool(restaurantPlaces, 'live', {
      radiusMeters: RADIUS_METERS,
      rankPreference: 'DISTANCE',
      maxResultCount: 20,
      includedTypes: ['restaurant'],
    });
    const cafePool = createPool(cafePlaces, 'live', {
      radiusMeters: RADIUS_METERS,
      rankPreference: 'DISTANCE',
      maxResultCount: 20,
      includedTypes: ['cafe'],
    });

    await setPool('southbay', 'restaurant', restaurantPool);
    await setPool('southbay', 'cafe', cafePool);

    return {
      success: true,
      restaurantCount: restaurantPlaces.length,
      cafeCount: cafePlaces.length,
    };
  } catch (error: any) {
    console.error('[refreshSouthBayPlaces] Error:', error);
    
    if (error.message === 'QUOTA_EXCEEDED' || error.message?.includes('quota')) {
      await setCooldown(7);
      return {
        success: false,
        restaurantCount: 0,
        cafeCount: 0,
        error: 'QUOTA_EXCEEDED - Cooldown activated for 7 days',
      };
    }

    return {
      success: false,
      restaurantCount: 0,
      cafeCount: 0,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Hook for managing Places data with local cache
 * HARD RULE: Never calls Places API on load/refresh
 * Only loads from cache (or seed if cache empty)
 */
export function usePlacesCache(
  categories: Array<'奶茶' | '中餐' | '夜宵' | '新店打卡'> = ['奶茶', '中餐', '夜宵', '新店打卡']
) {
  const [placesByCategory, setPlacesByCategory] = useState<Record<string, SpendPlace[]>>({});
  const [debugByCategory, setDebugByCategory] = useState<Record<string, PlacesDebugInfo>>({});
  const [loading, setLoading] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<Record<string, PlacesCacheInfo>>({});
  const [categoryOffsets, setCategoryOffsets] = useState<Record<string, number>>({});
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const debugParam = urlParams?.get('debugPlaces') === '1';
    const lsDebug = typeof window !== 'undefined' ? localStorage.getItem('places_debug') === '1' : false;
    setDebugMode(import.meta.env.DEV || debugParam || lsDebug);
  }, []);

  // Load from cache ONLY - never call Places API
  useEffect(() => {
    async function loadPlaces() {
      setLoading(true);
      let canonicalSeedPool: CachedPool | null = null;
      let canonicalVersion = '';
      let canonicalMilkTeaPlaces: SpendPlace[] = [];
      let canonicalLateNightPlaces: SpendPlace[] = [];
      try {
        const canonical = await loadMusthavePlaceIds();
        canonicalVersion = canonical.version;
        const canonicalEntries = canonical.places.filter((entry) => entry.place_id && !entry.disabled);
        if (canonicalEntries.length > 0) {
        const buildEntryMapsUrl = (entry: typeof canonicalEntries[number]) =>
          entry.place_id
            ? `https://www.google.com/maps/place/?q=place_id:${entry.place_id}`
            : entry.validation?.resolvedAddress
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                entry.validation.resolvedAddress
              )}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                entry.name + ' ' + entry.city
              )}`;

        const poolItems = canonicalEntries.map((entry) => ({
          placeId: entry.place_id!,
          name: entry.name,
          rating: entry.validation?.rating ?? 0,
          userRatingCount: entry.validation?.userRatingCount ?? 0,
          address: entry.addressHint || entry.city || 'South Bay',
          mapsUrl: buildEntryMapsUrl(entry),
          city: entry.city,
          photoRef: undefined,
        }));
          canonicalSeedPool = createPool(poolItems, 'seed');
          canonicalMilkTeaPlaces = canonicalEntries
            .filter((entry) => entry.place_id && entry.name && isMilkTeaName(entry.name))
            .map((entry) => ({
              id: entry.place_id!,
              name: entry.name,
              category: '奶茶',
              rating: entry.validation?.rating ?? 0,
              user_ratings_total: entry.validation?.userRatingCount ?? 0,
              maps_url: buildEntryMapsUrl(entry),
              city: entry.city || 'South Bay',
              score: 0,
              badges: entry.tags,
            }));
          canonicalLateNightPlaces = canonicalEntries
            .filter((entry) =>
              entry.place_id &&
              entry.name &&
              isLateNightName(entry.name)
            )
            .map((entry) => ({
              id: entry.place_id!,
              name: entry.name,
              category: '夜宵',
              rating: entry.validation?.rating ?? 0,
              user_ratings_total: entry.validation?.userRatingCount ?? 0,
              maps_url: buildEntryMapsUrl(entry),
              city: entry.city || 'South Bay',
              score: 0,
              badges: entry.tags,
            }));

          if (typeof window !== 'undefined') {
            const storedVersion = localStorage.getItem(MUSTHAVE_VERSION_KEY);
            if (storedVersion && storedVersion !== canonical.version) {
              await clearAllPools();
            }
            localStorage.setItem(MUSTHAVE_VERSION_KEY, canonical.version);
          }
          console.debug(`[musthave] canonical version=${canonical.version} count=${poolItems.length}`);
        }
      } catch (error) {
        console.warn('[musthave] canonical load failed, falling back to existing seeds', error);
      }

      try {
        // Load South Bay pools from cache (single region)
        const restaurantPool = await getPool('southbay', 'restaurant');
        const cafePool = await getPool('southbay', 'cafe');
        
        // Check if cached pools are missing rating/userRatingCount data
        // If seed file has rating data but cache doesn't, clear cache and reload
        const checkAndUpdateCache = async (pool: CachedPool | null, poolType: 'restaurant' | 'cafe', seedPool: CachedPool) => {
          if (pool && pool.items.length > 0) {
            // Check if cache has rating data
            const cacheHasRatingData = pool.items.some(p => p.rating > 0 || p.userRatingCount > 0);
            // Check if seed has rating data
            const seedHasRatingData = seedPool.items.some(p => p.rating > 0 || p.userRatingCount > 0);
            
            // If seed has rating data but cache doesn't, clear cache
            if (seedHasRatingData && !cacheHasRatingData) {
              console.log(`[usePlacesCache] Cache for ${poolType} is missing rating data, clearing and reloading from seed...`);
              await setPool('southbay', poolType, seedPool);
              return seedPool;
            }
            return pool;
          }
          return seedPool;
        };
        
        // If cache is empty, use seed data and store it
        let finalRestaurantPool = restaurantPool && restaurantPool.items.length > 0
          ? restaurantPool
          : canonicalSeedPool ?? await getSeedPool('cupertino', 'restaurant');
        let finalCafePool = cafePool && cafePool.items.length > 0
          ? cafePool
          : canonicalSeedPool ?? await getSeedPool('cupertino', 'cafe');
        
        // Check and update caches if needed
        const seedRestaurantPool = await getSeedPool('cupertino', 'restaurant');
        const seedCafePool = await getSeedPool('cupertino', 'cafe');
        finalRestaurantPool = await checkAndUpdateCache(finalRestaurantPool, 'restaurant', seedRestaurantPool);
        finalCafePool = await checkAndUpdateCache(finalCafePool, 'cafe', seedCafePool);
        
        // Store seed pools in cache so next load is instant
        if (finalRestaurantPool.sourceMode === 'seed' && finalRestaurantPool.items.length > 0) {
          await setPool('southbay', 'restaurant', finalRestaurantPool);
        }
        if (finalCafePool.sourceMode === 'seed' && finalCafePool.items.length > 0) {
          await setPool('southbay', 'cafe', finalCafePool);
        }

        // Curate places for each category (region-aware)
        const newPlacesByCategory: Record<string, SpendPlace[]> = {};
        const newCacheInfo: Record<string, PlacesCacheInfo> = {};
        const newDebug: Record<string, PlacesDebugInfo> = {};

        for (const category of categories) {
          // For 奶茶 and 夜宵, use canonical data directly if available
          if (category === '奶茶' && canonicalMilkTeaPlaces.length > 0) {
            newPlacesByCategory[category] = canonicalMilkTeaPlaces;
            newCacheInfo[category] = {
              mode: 'seed',
              cacheAgeDays: 0,
              poolSize: canonicalMilkTeaPlaces.length,
              refreshAttempted: false,
            };
            if (debugMode) {
              newDebug[category] = {
                region: 'canonical',
                tiersUsed: 1,
                excludedSamples: [],
                includedBreakdown: { canonical: canonicalMilkTeaPlaces.length },
              };
            }
            continue; // Skip the rest of the filtering logic
          }

          if (category === '夜宵' && canonicalLateNightPlaces.length > 0) {
            newPlacesByCategory[category] = canonicalLateNightPlaces;
            newCacheInfo[category] = {
              mode: 'seed',
              cacheAgeDays: 0,
              poolSize: canonicalLateNightPlaces.length,
              refreshAttempted: false,
            };
            if (debugMode) {
              newDebug[category] = {
                region: 'canonical',
                tiersUsed: 1,
                excludedSamples: [],
                includedBreakdown: { canonical: canonicalLateNightPlaces.length },
              };
            }
            continue; // Skip the rest of the filtering logic
          }

          // Build candidates from pools
          const toCandidate = (p: CachedPlace) => ({
            id: p.placeId,
            name: p.name,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            city: p.city || 'South Bay',
            vicinity: p.address || '',
            types: [],
            categories: [],
            mapsUrl: p.mapsUrl,
          });

          let candidates: CachedPlace[] = [];
          if (category === '奶茶') {
            candidates = finalCafePool?.items || [];
          } else if (category === '新店打卡') {
            let newPlacesPool = await getNewPlacesPoolFromCache();
            if (!newPlacesPool || newPlacesPool.items.length === 0) {
              const seedPlaces = await loadSeedFile('新店打卡');
              newPlacesPool = createPool(seedPlaces, 'seed');
              if (seedPlaces.length > 0) {
                await setNewPlacesPoolToCache(newPlacesPool);
              }
            }
            candidates = newPlacesPool?.items || [];
            newCacheInfo[category] = {
              mode: newPlacesPool?.sourceMode || 'seed',
              cacheAgeDays: newPlacesPool ? getCacheAgeDays(newPlacesPool) : undefined,
              poolSize: newPlacesPool?.items.length || 0,
              refreshAttempted: false,
            };
          } else {
            candidates = finalRestaurantPool?.items || [];
          }

          const catKey: CategoryKey =
            category === '奶茶' ? 'milkTea' :
            category === '中餐' ? 'chinese' :
            category === '夜宵' ? 'lateNight' : 'newOpenings';

          const curated = curatePlaces(candidates.map(toCandidate), {
            category: catKey,
            regionKey: 'southbay',
            city: 'South Bay',
            debug: debugMode,
          });

          let finalItems = curated.items;
          if (category !== '新店打卡') {
            if (finalItems.length < 10) {
              // Fallback 1: run with default region profile to relax priors
              const relaxedResult = curatePlaces(candidates.map(toCandidate), {
                category: catKey,
                regionKey: 'default',
                city: 'South Bay',
                debug: debugMode,
              });
              const mergedRelaxed = [...finalItems, ...relaxedResult.items];
              finalItems = Array.from(new Map(mergedRelaxed.map((p) => [p.id, p])).values());
              if (debugMode && curated.debug) {
                curated.debug.excludedSamples = [...(curated.debug.excludedSamples || []), ...(relaxedResult.debug?.excludedSamples || [])].slice(0, 10);
                curated.debug.includedBreakdown = { ...(curated.debug.includedBreakdown || {}), ...(relaxedResult.debug?.includedBreakdown || {}) };
              }
            }
            if (finalItems.length < 10) {
              const seedPool = canonicalSeedPool
                ? canonicalSeedPool
                : category === '奶茶'
                  ? await getSeedPool('cupertino', 'cafe')
                  : await getSeedPool('cupertino', 'restaurant');
              const seedResult = curatePlaces((seedPool.items || []).map(toCandidate), {
                category: catKey,
                regionKey: 'southbay',
                city: 'South Bay',
                debug: debugMode,
              });
              const merged = [...finalItems, ...seedResult.items];
              finalItems = Array.from(new Map(merged.map((p) => [p.id, p])).values());
              if (debugMode && curated.debug) {
                curated.debug.excludedSamples = [...(curated.debug.excludedSamples || []), ...(seedResult.debug?.excludedSamples || [])].slice(0, 10);
                curated.debug.includedBreakdown = { ...(curated.debug.includedBreakdown || {}), ...(seedResult.debug?.includedBreakdown || {}) };
              }
            }
          }

          if (category === '奶茶' && canonicalMilkTeaPlaces.length > 0) {
            finalItems = Array.from(
              new Map(canonicalMilkTeaPlaces.map((p) => [p.id, p])).values()
            );
          }
          if (category === '夜宵' && canonicalLateNightPlaces.length > 0) {
            finalItems = Array.from(
              new Map(canonicalLateNightPlaces.map((p) => [p.id, p])).values()
            );
          }
          newPlacesByCategory[category] = finalItems.map((p) => ({
            id: p.id,
            name: p.name,
            category,
            rating: p.rating,
            user_ratings_total: p.userRatingCount,
            maps_url: (p as any).mapsUrl || '',
            city: p.city || 'South Bay',
            score: p.score,
            badges: (p as any).badges,
          }));

          if (!newCacheInfo[category]) {
            const sourceMode = category === '奶茶' ? finalCafePool?.sourceMode : finalRestaurantPool?.sourceMode;
            const pool = category === '奶茶' ? finalCafePool : finalRestaurantPool;
            newCacheInfo[category] = {
              mode: sourceMode || 'cache',
              cacheAgeDays: pool ? getCacheAgeDays(pool) : undefined,
              poolSize: pool?.items.length || 0,
              refreshAttempted: false,
            };
          }

          if (debugMode && curated.debug) {
            newDebug[category] = {
              region: curated.debug.region,
              tiersUsed: curated.debug.tiersUsed,
              excludedSamples: curated.debug.excludedSamples,
              includedBreakdown: curated.debug.includedBreakdown,
            };
          }
        }

        setPlacesByCategory(newPlacesByCategory);
        setCacheInfo(newCacheInfo);
        if (debugMode) {
          setDebugByCategory(newDebug);
        }
        
        // NO AUTO-REFRESH - cache is treated as infinite
      } catch (error) {
        console.error('[usePlacesCache] Error loading places:', error);
        // Fallback to seed data if everything fails
        const seedPlacesByCategory: Record<string, SpendPlace[]> = {};
        const seedCacheInfo: Record<string, PlacesCacheInfo> = {};
        for (const category of categories) {
          if (category === '新店打卡') {
            const seedPlaces = await loadSeedFile('新店打卡');
            const seedCached = seedPlaces.map((p) => cachedPlaceToSpend(p, category, 'southbay'));
            seedPlacesByCategory[category] = seedCached.slice(0, 5);
            seedCacheInfo[category] = {
              mode: 'seed',
              poolSize: seedPlaces.length,
              refreshAttempted: false,
            };
          } else {
            const seedRestaurant = await getSeedPool('cupertino', 'restaurant');
            const seedCafe = await getSeedPool('cupertino', 'cafe');
            const seedPlaces = filterPlacesForCategory(
              seedRestaurant,
              seedCafe,
              category,
              'southbay',
              true
            );
            // Ensure at least 5 items for carousel
            const minPlaces = seedPlaces.length >= 5 ? seedPlaces.slice(0, 5) : seedPlaces;
            seedPlacesByCategory[category] = minPlaces;
            seedCacheInfo[category] = {
              mode: 'seed',
              poolSize: seedPlaces.length,
              refreshAttempted: false,
            };
          }
        }
        setPlacesByCategory(seedPlacesByCategory);
        setCacheInfo(seedCacheInfo);
      } finally {
        setLoading(false);
      }
    }

    loadPlaces();
  }, [categories.join(',')]);

  // Handle "换一批" - cache-only rotation (NO API calls)
  const handleRefresh = useCallback(
    async (category: string) => {
      setPlacesByCategory((prev) => {
        const list = prev[category] || [];
        if (!list.length) return prev;
        const rotated = [...list.slice(5), ...list.slice(0, 5)];
        return { ...prev, [category]: rotated };
      });
    },
    []
  );

  return {
    placesByCategory,
    loading,
    cacheInfo,
    categoryOffsets,
    debugByCategory,
    handleRefresh,
    refreshSouthBayPlaces,
  };
}

/**
 * Manual refresh for "新店打卡" category
 * Makes exactly 1 Places API call and updates cache
 */
export async function refreshNewPlaces(): Promise<{
  success: boolean;
  itemCount: number;
  error?: string;
  reason?: 'QUOTA_EXCEEDED' | 'FETCH_FAIL' | 'NON_JSON' | 'COOLDOWN_ACTIVE';
}> {
  try {
    // Check cooldown
    const inCooldown = await isInCooldown();
    if (inCooldown) {
      return {
        success: false,
        itemCount: 0,
        error: 'In cooldown period (quota exceeded recently)',
        reason: 'COOLDOWN_ACTIVE',
      };
    }

    // Call API endpoint
    const apiUrl = `${config.apiBaseUrl}/api/spend/new-places?manual_refresh=1`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        await setCooldown(NEW_PLACES_COOLDOWN_DAYS);
        return {
          success: false,
          itemCount: 0,
          error: 'QUOTA_EXCEEDED - Cooldown activated for 7 days',
          reason: 'QUOTA_EXCEEDED',
        };
      }
      
      const errorText = await response.text();
      return {
        success: false,
        itemCount: 0,
        error: `API error: ${response.status} - ${errorText.substring(0, 100)}`,
        reason: 'FETCH_FAIL',
      };
    }

    // Parse response
    let data: CachedPool;
    try {
      data = await response.json();
    } catch (parseError) {
      return {
        success: false,
        itemCount: 0,
        error: 'Invalid JSON response',
        reason: 'NON_JSON',
      };
    }

    // Validate pool structure
    if (!data.items || !Array.isArray(data.items)) {
      return {
        success: false,
        itemCount: 0,
        error: 'Invalid pool structure in response',
        reason: 'FETCH_FAIL',
      };
    }

    // Update cache
    await setNewPlacesPoolToCache(data);

    // If < 3 items, supplement with seed data
    if (data.items.length < 3) {
      const seedPool = await getSeedPool('cupertino', 'restaurant');
      const seedCafe = await getSeedPool('cupertino', 'cafe');
      const seedPlaces = filterPlacesForCategory(
        seedPool,
        seedCafe,
        '新店打卡',
        'southbay',
        true
      );
      
      if (seedPlaces.length > 0) {
        const seedCached = seedPlaces.map((p) => apiPlaceToCached(p));
        // Combine API results with seed, but keep sourceMode as 'live' if we got any API results
        const combinedItems = [...data.items, ...seedCached];
        // Deduplicate by placeId
        const deduped = Array.from(
          new Map(combinedItems.map((p) => [p.placeId, p])).values()
        ).slice(0, 20);
        
        const combinedPool = createPool(
          deduped,
          data.items.length > 0 ? 'live' : 'seed' // Keep 'live' if we got API results
        );
        combinedPool.updatedAt = data.updatedAt; // Preserve timestamp
        combinedPool.ttlDays = data.ttlDays;
        combinedPool.requestMeta = data.requestMeta;
        await setNewPlacesPoolToCache(combinedPool);
      }
    }

    return {
      success: true,
      itemCount: data.items.length,
    };
  } catch (error: any) {
    console.error('[refreshNewPlaces] Error:', error);
    
    // Handle quota exceeded
    if (error.message === 'QUOTA_EXCEEDED' || error.message?.includes('quota')) {
      await setCooldown(NEW_PLACES_COOLDOWN_DAYS);
      return {
        success: false,
        itemCount: 0,
        error: 'QUOTA_EXCEEDED - Cooldown activated for 7 days',
        reason: 'QUOTA_EXCEEDED',
      };
    }

    return {
      success: false,
      itemCount: 0,
      error: error.message || 'Unknown error',
      reason: 'FETCH_FAIL',
    };
  }
}

/**
 * Re-export getNewPlacesPool for use in components
 */
export async function getNewPlacesPool(): Promise<CachedPool | null> {
  return getNewPlacesPoolFromCache();
}

/**
 * Clear new places pool cache and force reload from seed file
 * Useful for debugging when cache is empty or stale
 */
export async function clearNewPlacesCache(): Promise<void> {
  await clearNewPlacesPool();
  console.log('[usePlacesCache] New places cache cleared. Will reload from seed file on next load.');
}

/**
 * Get cache status for debug UI
 */
export async function getCacheStatus(): Promise<{
  restaurantPool: { updatedAt: number; itemCount: number; cacheAgeDays: number } | null;
  cafePool: { updatedAt: number; itemCount: number; cacheAgeDays: number } | null;
  newPlacesPool: { updatedAt: number; itemCount: number; cacheAgeDays: number } | null;
  inCooldown: boolean;
  cooldownUntil: number | null;
}> {
  const restaurantPool = await getPool('southbay', 'restaurant');
  const cafePool = await getPool('southbay', 'cafe');
  const newPlacesPool = await getNewPlacesPoolFromCache();
  const inCooldown = await isInCooldown();
  
  // Get cooldown until time
  let cooldownUntil: number | null = null;
  try {
    cooldownUntil = (await get<number>('places_quota_cooldown_until')) || null;
  } catch (error) {
    // Ignore
  }

  return {
    restaurantPool: restaurantPool
      ? {
          updatedAt: restaurantPool.updatedAt,
          itemCount: restaurantPool.items.length,
          cacheAgeDays: getCacheAgeDays(restaurantPool),
        }
      : null,
    cafePool: cafePool
      ? {
          updatedAt: cafePool.updatedAt,
          itemCount: cafePool.items.length,
          cacheAgeDays: getCacheAgeDays(cafePool),
        }
      : null,
    newPlacesPool: newPlacesPool
      ? {
          updatedAt: newPlacesPool.updatedAt,
          itemCount: newPlacesPool.items.length,
          cacheAgeDays: getCacheAgeDays(newPlacesPool),
        }
      : null,
    inCooldown,
    cooldownUntil,
  };
}
