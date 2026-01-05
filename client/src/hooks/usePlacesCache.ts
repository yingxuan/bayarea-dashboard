/**
 * Hook for managing Places data with local cache
 * Implements client-side persistent cache with IndexedDB
 */

import { useState, useEffect, useCallback } from 'react';
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
  getNewPlacesPool as getNewPlacesPoolFromCache,
  setNewPlacesPool as setNewPlacesPoolToCache,
  clearNewPlacesPool,
  type CachedPool,
  type CachedPlace,
} from '@/lib/places/localCache';
import { config } from '@/config';
import { NEW_PLACES_TTL_DAYS, NEW_PLACES_COOLDOWN_DAYS } from '@/config/places';

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
  photo_url?: string;
  maps_url: string;
  city: string;
}

interface PlacesCacheInfo {
  mode: 'live' | 'cache' | 'seed';
  cacheAgeDays?: number;
  poolSize?: number;
  refreshAttempted?: boolean;
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
  };
}

/**
 * Convert cached place to SpendPlace format
 */
function cachedPlaceToSpend(cached: CachedPlace, category: string, city: string): SpendPlace {
  // Use cached.city if available (from seed data), otherwise use provided city
  const finalCity = cached.city || city;
  
  // Build photo_url from photoRef
  // photoRef can be:
  // - photoName (New API): "places/{place_id}/photos/{photo_id}"
  // - photoReference (Legacy): "CmRa..."
  // - photoUrl: direct URL
  let photo_url: string | undefined;
  if (cached.photoRef) {
    if (cached.photoRef.startsWith('http')) {
      // Already a URL
      photo_url = cached.photoRef;
    } else if (cached.photoRef.startsWith('places/')) {
      // New API photoName - will be proxied via server
      photo_url = cached.photoRef;
    } else {
      // Legacy photoReference - will be proxied via server
      photo_url = cached.photoRef;
    }
  }
  
  const result: SpendPlace = {
    id: cached.placeId,
    name: cached.name,
    category,
    rating: cached.rating,
    user_ratings_total: cached.userRatingCount,
    distance_miles: undefined,
    photo_url, // Can be photoName, photoReference, or URL
    maps_url: cached.mapsUrl,
    city: finalCity, // Preserve city from seed data
  };
  
  // Debug log for places with rating data
  if ((cached.rating > 0 || cached.userRatingCount > 0) && import.meta.env.DEV) {
    console.log(`[cachedPlaceToSpend] Converting ${category} place "${cached.name}": rating=${cached.rating}, count=${cached.userRatingCount} -> rating=${result.rating}, user_ratings_total=${result.user_ratings_total}`);
  }
  
  return result;
}

/**
 * Filter places for category from pools
 */
function filterPlacesForCategory(
  restaurantPool: CachedPool | null,
  cafePool: CachedPool | null,
  category: '奶茶' | '中餐' | '夜宵' | '新店打卡',
  city: string,
  relaxed: boolean = false
): SpendPlace[] {
  let sourcePool: CachedPool | null;
  let filterFn: (place: CachedPlace) => boolean;
  let scoreFn: (place: CachedPlace) => number;

  switch (category) {
    case '奶茶':
      sourcePool = cafePool;
      if (relaxed) {
        filterFn = () => true; // Accept all cafes
      } else {
        filterFn = (p) => {
          const nameLower = p.name.toLowerCase();
          return (
            nameLower.includes('bubble') ||
            nameLower.includes('boba') ||
            nameLower.includes('tea') ||
            nameLower.includes('奶茶')
          );
        };
      }
      scoreFn = (p) => p.userRatingCount * p.rating;
      break;

    case '中餐':
      sourcePool = restaurantPool;
      if (relaxed) {
        filterFn = () => true; // Accept all restaurants
      } else {
        filterFn = (p) => {
          const nameLower = p.name.toLowerCase();
          return (
            nameLower.includes('chinese') ||
            nameLower.includes('szechuan') ||
            nameLower.includes('hunan') ||
            nameLower.includes('cantonese') ||
            nameLower.includes('中餐') ||
            nameLower.includes('川菜') ||
            nameLower.includes('湘菜')
          );
        };
      }
      scoreFn = (p) => p.userRatingCount * p.rating;
      break;

    case '夜宵':
      sourcePool = restaurantPool;
      if (relaxed) {
        filterFn = () => true; // Accept all restaurants
      } else {
        // Initial filter: name-based heuristics (opening hours filtering happens in component after enrichment)
        filterFn = (p) => {
          const nameLower = p.name.toLowerCase();
          return (
            nameLower.includes('hot pot') ||
            nameLower.includes('bbq') ||
            nameLower.includes('烧烤') ||
            nameLower.includes('火锅') ||
            nameLower.includes('ramen') ||
            nameLower.includes('pho') ||
            nameLower.includes('izakaya') ||
            nameLower.includes('拉面')
          );
        };
      }
      scoreFn = (p) => p.userRatingCount * p.rating;
      break;

    case '新店打卡':
      // Combine both pools, filter by low review count
      const combinedPlaces: CachedPlace[] = [];
      if (restaurantPool) combinedPlaces.push(...restaurantPool.items);
      if (cafePool) combinedPlaces.push(...cafePool.items);
      const deduped = Array.from(new Map(combinedPlaces.map((p) => [p.placeId, p])).values());
      sourcePool = deduped.length > 0 ? createPool(deduped, restaurantPool?.sourceMode || 'cache') : null;
      if (relaxed) {
        filterFn = (p) => p.rating >= 3.5; // Relaxed: just need decent rating
      } else {
        filterFn = (p) => p.userRatingCount < 100 && p.rating >= 4.0;
      }
      scoreFn = (p) => {
        const newnessScore = 100 - Math.min(p.userRatingCount, 100);
        return newnessScore + (p.rating * 10);
      };
      break;

    default:
      return [];
  }

  if (!sourcePool || sourcePool.items.length === 0) return [];

  // Filter and convert
  const filtered = sourcePool.items
    .filter(filterFn)
    .map((p) => ({
      ...cachedPlaceToSpend(p, category, city),
      score: scoreFn(p),
    }))
    .sort((a, b) => b.score - a.score);

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
  const [loading, setLoading] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<Record<string, PlacesCacheInfo>>({});
  const [categoryOffsets, setCategoryOffsets] = useState<Record<string, number>>({});

  // Load from cache ONLY - never call Places API
  useEffect(() => {
    async function loadPlaces() {
      setLoading(true);

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
          : await getSeedPool('cupertino', 'restaurant'); // Use cupertino seed as South Bay seed
        let finalCafePool = cafePool && cafePool.items.length > 0
          ? cafePool
          : await getSeedPool('cupertino', 'cafe');
        
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

        // Filter places for each category from South Bay pools
        const newPlacesByCategory: Record<string, SpendPlace[]> = {};
        const newCacheInfo: Record<string, PlacesCacheInfo> = {};

        for (const category of categories) {
          // Special handling for 新店打卡: use dedicated new places pool
          if (category === '新店打卡') {
            let newPlacesPool = await getNewPlacesPoolFromCache();
            
            // Check if seed file is newer than cache
            let shouldReloadFromSeed = false;
            if (newPlacesPool) {
              try {
                // Load seed file metadata to check updatedAt
                const seedModule = await import('@/lib/seeds/southbay/新店打卡.json');
                const seedFile = seedModule.default || seedModule;
                const seedUpdatedAt = seedFile.updatedAt ? new Date(seedFile.updatedAt).getTime() : 0;
                const cacheUpdatedAt = newPlacesPool.updatedAt;
                
                // If seed file is newer than cache, clear cache and reload
                if (seedUpdatedAt > cacheUpdatedAt) {
                  console.log(`[usePlacesCache] Seed file updated (${new Date(seedUpdatedAt).toISOString()}) is newer than cache (${new Date(cacheUpdatedAt).toISOString()}), clearing cache...`);
                  await clearNewPlacesPool();
                  newPlacesPool = null;
                  shouldReloadFromSeed = true;
                }
              } catch (error) {
                console.warn('[usePlacesCache] Could not check seed file timestamp:', error);
              }
            }
            
            // If cache is empty or has 0 items, clear it and load from seed data
            if (!newPlacesPool || newPlacesPool.items.length === 0 || shouldReloadFromSeed) {
              // Clear empty cache to force reload
              if (newPlacesPool && newPlacesPool.items.length === 0) {
                console.log('[usePlacesCache] Clearing empty 新店打卡 cache...');
                await clearNewPlacesPool();
              }
              
              console.log('[usePlacesCache] Loading 新店打卡 from seed file...');
              // Load seed file directly for 新店打卡 (don't use filterPlacesForCategory which filters by rating)
              const { loadSeedFile } = await import('@/lib/places/localCache');
              const seedPlaces = await loadSeedFile('新店打卡');
              
              console.log(`[usePlacesCache] Loaded ${seedPlaces.length} places from seed file for 新店打卡`);
              
              if (seedPlaces.length === 0) {
                console.warn('[usePlacesCache] Seed file for 新店打卡 is empty! Check seed file at client/src/lib/seeds/southbay/新店打卡.json');
              }
              
              // Create pool from seed
              newPlacesPool = createPool(seedPlaces, 'seed');
              
              // Store seed pool in cache (only if we have items)
              if (seedPlaces.length > 0) {
                await setNewPlacesPoolToCache(newPlacesPool);
                console.log(`[usePlacesCache] Stored ${seedPlaces.length} places in cache for 新店打卡`);
              } else {
                console.warn('[usePlacesCache] Not storing empty pool in cache for 新店打卡');
              }
            } else {
              console.log(`[usePlacesCache] Using cached 新店打卡 pool with ${newPlacesPool.items.length} items`);
            }
            
            // Get rotation cursor
            const tileKey = `${category}`;
            const cursor = await getRotationCursor(tileKey);
            
            // Rotate places
            const rotated = rotatePlaces(newPlacesPool.items, cursor, 5);
            
            // Debug: log places with rating data
            const placesWithRating = rotated.filter(p => p.rating > 0 || p.userRatingCount > 0);
            if (placesWithRating.length > 0) {
              console.log(`[usePlacesCache] 新店打卡: ${placesWithRating.length} places with rating data:`, 
                placesWithRating.map(p => `${p.name} (rating: ${p.rating}, count: ${p.userRatingCount})`));
            } else {
              console.warn(`[usePlacesCache] 新店打卡: No places with rating data found in rotated list`);
            }
            
            newPlacesByCategory[category] = rotated.map((p) =>
              cachedPlaceToSpend(p, category, 'southbay')
            );
            
            newCacheInfo[category] = {
              mode: newPlacesPool.sourceMode,
              cacheAgeDays: getCacheAgeDays(newPlacesPool),
              poolSize: newPlacesPool.items.length,
              refreshAttempted: false,
            };
            
            continue;
          }
          
          // Special handling for 中餐 and 夜宵: load directly from seed file (don't use name-based filtering)
          let allPlaces: SpendPlace[];
          if (category === '中餐' || category === '夜宵') {
            const { loadSeedFile } = await import('@/lib/places/localCache');
            const seedPlaces = await loadSeedFile(category);
            
            // Convert seed places to SpendPlace format
            allPlaces = seedPlaces.map((p) => cachedPlaceToSpend(p, category, 'southbay'));
            
            // Sort by rating * userRatingCount (if available) or just by name
            allPlaces.sort((a, b) => {
              const scoreA = (a.rating || 0) * (a.user_ratings_total || 0);
              const scoreB = (b.rating || 0) * (b.user_ratings_total || 0);
              return scoreB - scoreA;
            });
          } else {
            // Other categories: use restaurant/cafe pools
            const categoryPlaces = filterPlacesForCategory(
              finalRestaurantPool,
              finalCafePool,
              category,
              'southbay'
            );
            
            // Ensure >=5 items for carousel display (relax thresholds if needed)
            allPlaces = categoryPlaces;
            if (allPlaces.length < 5) {
              // Relax filtering - accept all places from pool
              const relaxedPlaces = filterPlacesForCategory(
                finalRestaurantPool,
                finalCafePool,
                category,
                'southbay',
                true // relaxed mode
              );
              allPlaces = relaxedPlaces.length >= 5 ? relaxedPlaces : allPlaces;
            }
            
            // If still <5, supplement with seed data
            if (allPlaces.length < 5) {
              const seedRestaurant = await getSeedPool('cupertino', 'restaurant');
              const seedCafe = await getSeedPool('cupertino', 'cafe');
              const seedPlaces = filterPlacesForCategory(
                seedRestaurant,
                seedCafe,
                category,
                'southbay',
                true
              );
              // Combine and deduplicate by placeId
              const combined = [...allPlaces, ...seedPlaces];
              const deduped = Array.from(
                new Map(combined.map((p) => [p.id, p])).values()
              );
              allPlaces = deduped.length >= 5 ? deduped.slice(0, Math.max(5, deduped.length)) : deduped;
            }
          }

          // Get rotation cursor
          const tileKey = `${category}`;
          const cursor = await getRotationCursor(tileKey);
          
          // Convert to CachedPlace for rotation
          const cachedPlaces = allPlaces.map((p) => apiPlaceToCached(p));
          const rotated = rotatePlaces(cachedPlaces, cursor, 5);

          newPlacesByCategory[category] = rotated.map((p) =>
            cachedPlaceToSpend(p, category, 'southbay')
          );

          // Cache info
          const sourcePool = category === '奶茶' ? finalCafePool : finalRestaurantPool;
          newCacheInfo[category] = {
            mode: sourcePool?.sourceMode || 'seed',
            cacheAgeDays: sourcePool ? getCacheAgeDays(sourcePool) : undefined,
            poolSize: allPlaces.length,
            refreshAttempted: false,
          };
        }

        setPlacesByCategory(newPlacesByCategory);
        setCacheInfo(newCacheInfo);
        
        // NO AUTO-REFRESH - cache is treated as infinite
      } catch (error) {
        console.error('[usePlacesCache] Error loading places:', error);
        // Fallback to seed data if everything fails
        const seedPlacesByCategory: Record<string, SpendPlace[]> = {};
        const seedCacheInfo: Record<string, PlacesCacheInfo> = {};
        for (const category of categories) {
          if (category === '新店打卡') {
            // Load seed file directly for 新店打卡
            const { loadSeedFile } = await import('@/lib/places/localCache');
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
      const tileKey = `${category}`;
      const currentCursor = await getRotationCursor(tileKey);
      const newCursor = (currentCursor + 5) % 20; // Rotate by 5, wrap at 20
      await setRotationCursor(tileKey, newCursor);

      // Special handling for 新店打卡: use dedicated new places pool
      if (category === '新店打卡') {
        let newPlacesPool = await getNewPlacesPoolFromCache();
        if (!newPlacesPool || newPlacesPool.items.length === 0) {
          // Load seed file directly for 新店打卡
          const { loadSeedFile } = await import('@/lib/places/localCache');
          const seedPlaces = await loadSeedFile('新店打卡');
          newPlacesPool = createPool(seedPlaces, 'seed');
        }
        
        const rotated = rotatePlaces(newPlacesPool.items, newCursor, 5);
        const newPlaces = rotated.map((p) => cachedPlaceToSpend(p, category, 'southbay'));
        
        setPlacesByCategory((prev) => ({
          ...prev,
          [category]: newPlaces,
        }));
        
        setCategoryOffsets((prev) => ({
          ...prev,
          [category]: newCursor,
        }));
        
        return;
      }

      // Other categories: use restaurant/cafe pools
      const restaurantPool = await getPool('southbay', 'restaurant');
      const cafePool = await getPool('southbay', 'cafe');
      
      const finalRestaurantPool = restaurantPool && restaurantPool.items.length > 0
        ? restaurantPool
        : await getSeedPool('cupertino', 'restaurant');
      const finalCafePool = cafePool && cafePool.items.length > 0
        ? cafePool
        : await getSeedPool('cupertino', 'cafe');

      const categoryPlaces = filterPlacesForCategory(
        finalRestaurantPool,
        finalCafePool,
        category as any,
        'southbay'
      );

      // Apply rotation
      const cachedPlaces = categoryPlaces.map((p) => apiPlaceToCached(p));
      const rotated = rotatePlaces(cachedPlaces, newCursor, 5);

      const newPlaces = rotated.map((p) => cachedPlaceToSpend(p, category, 'southbay'));

      setPlacesByCategory((prev) => ({
        ...prev,
        [category]: newPlaces,
      }));

      setCategoryOffsets((prev) => ({
        ...prev,
        [category]: newCursor,
      }));
    },
    []
  );

  return {
    placesByCategory,
    loading,
    cacheInfo,
    categoryOffsets,
    handleRefresh,
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
    const { get } = await import('idb-keyval');
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
