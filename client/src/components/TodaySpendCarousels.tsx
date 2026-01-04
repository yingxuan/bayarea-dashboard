/**
 * Today Spend Carousels Component
 * Displays 2×2 grid: 奶茶/中餐, 夜宵/甜品
 * 
 * Requirements:
 * - 4 horizontal image carousels
 * - Each category shows 6 places
 * - Never show empty sections
 */

import { useEffect, useState } from "react";
import { config } from "@/config";
import SpendCarousel from "./SpendCarousel";

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

interface SpendResponse {
  itemsByCategory?: Record<string, SpendPlace[]>;
  items?: SpendPlace[]; // Legacy format
}

// 2×2 grid: 奶茶/中餐, 夜宵/新店打卡
const CATEGORIES = ['奶茶', '中餐', '夜宵', '新店打卡'] as const;

export default function TodaySpendCarousels() {
  const [placesByCategory, setPlacesByCategory] = useState<Record<string, SpendPlace[]>>({});
  const [loading, setLoading] = useState(true);
  // Track current display offset for each category (for "换一批" button)
  const [categoryOffsets, setCategoryOffsets] = useState<Record<string, number>>({
    '奶茶': 0,
    '中餐': 0,
    '夜宵': 0,
    '甜品': 0,
  });

  useEffect(() => {
    async function loadRecommendations() {
      try {
        // Get user location (geolocation API)
        let userLocation: { lat: number; lng: number } | null = null;
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocation not supported'));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 5 * 60 * 1000, // Cache for 5 minutes
            });
          });
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          console.log('[TodaySpendCarousels] User location:', userLocation);
        } catch (error) {
          console.warn('[TodaySpendCarousels] Failed to get user location, using default:', error);
        }
        
        // Build API URL with user location if available
        // Handle both absolute URLs and relative paths
        let apiUrl: string;
        if (config.apiBaseUrl && !config.apiBaseUrl.startsWith('/')) {
          // Absolute URL - use URL constructor
          const url = new URL(`${config.apiBaseUrl}/api/spend/today`);
          if (userLocation) {
            url.searchParams.set('lat', userLocation.lat.toString());
            url.searchParams.set('lng', userLocation.lng.toString());
          }
          apiUrl = url.toString();
        } else {
          // Relative path - use string concatenation
          const baseUrl = config.apiBaseUrl || '';
          const path = `${baseUrl}/api/spend/today`;
          if (userLocation) {
            const params = new URLSearchParams({
              lat: userLocation.lat.toString(),
              lng: userLocation.lng.toString(),
            });
            apiUrl = `${path}?${params.toString()}`;
          } else {
            apiUrl = path;
          }
        }
        
        console.log('[TodaySpendCarousels] Fetching from:', apiUrl);
        
        const controller = new AbortController();
        let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
          console.warn('[TodaySpendCarousels] Request timeout after 10 seconds, aborting...');
          controller.abort();
        }, 10000);

        let response: Response;
        try {
          response = await fetch(apiUrl, {
            signal: controller.signal,
          });
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          // Check if it's an abort error (timeout or manual abort)
          if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
            console.warn('[TodaySpendCarousels] Request was aborted (likely timeout or component unmount)');
            // Don't throw - just return empty state
            setPlacesByCategory({
              '奶茶': [],
              '中餐': [],
              '夜宵': [],
              '甜品': [],
            });
            return;
          }
          throw error;
        }

        console.log('[TodaySpendCarousels] Response status:', response.status, response.statusText);

        if (response.ok) {
          const result: SpendResponse = await response.json();
          console.log('[TodaySpendCarousels] ✅ API Response received');
          console.log('[TodaySpendCarousels] Full API response:', result);
          console.log('[TodaySpendCarousels] API response summary:', {
            hasItemsByCategory: !!result.itemsByCategory,
            itemsByCategoryKeys: result.itemsByCategory ? Object.keys(result.itemsByCategory) : [],
            itemsByCategoryCounts: result.itemsByCategory ? Object.entries(result.itemsByCategory).map(([k, v]) => `${k}: ${v.length}`) : [],
            itemsCount: result.items?.length || 0,
            status: result.status,
            cache_hit: result.cache_hit,
            error: result.error,
          });
          
          // Prefer using itemsByCategory if available (API returns English keys: milk_tea, chinese, coffee, late_night)
          // Then fallback to items array if itemsByCategory is empty
          if (result.itemsByCategory && Object.keys(result.itemsByCategory).length > 0) {
            console.log('[TodaySpendCarousels] Using itemsByCategory format (primary)');
            console.log('[TodaySpendCarousels] itemsByCategory keys:', Object.keys(result.itemsByCategory));
            console.log('[TodaySpendCarousels] itemsByCategory structure:', Object.entries(result.itemsByCategory).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : 'not array'}`));
            
            // Map English keys from API to Chinese categories
            const keyMap: Record<string, string> = {
              'milk_tea': '奶茶',
              'chinese': '中餐',
              'late_night': '夜宵',
              'new_places': '新店打卡',
            };
            
            const normalized: Record<string, SpendPlace[]> = {
              '奶茶': [],
              '中餐': [],
              '夜宵': [],
              '新店打卡': [],
            };
            
            // Try to map itemsByCategory to normalized structure
            for (const [key, places] of Object.entries(result.itemsByCategory)) {
              const chineseCategory = keyMap[key]; // Use keyMap to get Chinese category
              console.log(`[TodaySpendCarousels] Processing key "${key}" -> category "${chineseCategory}"`);
              
              if (!chineseCategory) {
                console.warn(`[TodaySpendCarousels] No mapping for key "${key}", skipping`);
                continue;
              }
              
              if (!CATEGORIES.includes(chineseCategory as any)) {
                console.warn(`[TodaySpendCarousels] Category "${chineseCategory}" not in expected categories, skipping`);
                continue;
              }
              
              const placesArray = Array.isArray(places) ? places : [];
              console.log(`[TodaySpendCarousels] Found ${placesArray.length} places for key "${key}" (category: "${chineseCategory}")`);
              
              if (placesArray.length > 0) {
                console.log(`[TodaySpendCarousels] Sample place from "${key}":`, placesArray[0]);
              }
              
              // Add all places to the mapped category
              placesArray.forEach((place, idx) => {
                // Ensure place has the correct category field
                const placeWithCategory = { ...place, category: chineseCategory };
                normalized[chineseCategory].push(placeWithCategory);
                if (idx === 0) {
                  console.log(`[TodaySpendCarousels] Added place "${place.name}" to category "${chineseCategory}"`);
                }
              });
            }
            
            // Sort each category by score
            for (const category of CATEGORIES) {
              normalized[category].sort((a, b) => (b.score || 0) - (a.score || 0));
            }
            
            const normalizedSummary = Object.entries(normalized).map(([k, v]) => `${k}: ${v.length}`).join(', ');
            console.log('[TodaySpendCarousels] ✅ Normalized counts:', normalizedSummary);
            console.log('[TodaySpendCarousels] Detailed breakdown:');
            for (const [category, places] of Object.entries(normalized)) {
              console.log(`  ${category}: ${places.length} places`);
              if (places.length > 0) {
                console.log(`    Sample: ${places[0].name}`);
              }
            }
            console.log('[TodaySpendCarousels] Setting placesByCategory with', Object.keys(normalized).length, 'categories');
            setPlacesByCategory(normalized);
            // Reset offsets when new data is loaded
            setCategoryOffsets({
              '奶茶': 0,
              '中餐': 0,
              '夜宵': 0,
              '甜品': 0,
            });
          } else if (result.items && Array.isArray(result.items) && result.items.length > 0) {
            // Fallback: use items array format - group by place.category
            console.log('[TodaySpendCarousels] Using items array format (fallback), grouping by place.category');
            const grouped: Record<string, SpendPlace[]> = {
              '奶茶': [],
              '中餐': [],
              '夜宵': [],
              '甜品': [],
            };
            
            result.items.forEach(place => {
              const placeCategory = place.category;
              
              console.log(`[TodaySpendCarousels] Place: ${place.name}, category: "${placeCategory}"`);
              
              // Map API categories to expected categories
              // API might return: 奶茶, 中餐, 新店打卡, 夜宵
              // Frontend expects: 奶茶, 中餐, 夜宵, 新店打卡
              const categoryMap: Record<string, string> = {
                '奶茶': '奶茶',
                '中餐': '中餐',
                '夜宵': '夜宵',
                '新店打卡': '新店打卡',
              };
              
              const mappedCategory = categoryMap[placeCategory] || placeCategory;
              
              // Try exact match with mapped category
              if (CATEGORIES.includes(mappedCategory as any)) {
                grouped[mappedCategory].push({ ...place, category: mappedCategory });
              } else {
                console.warn(`[TodaySpendCarousels] Unknown category: "${placeCategory}" (mapped: "${mappedCategory}") for place "${place.name}"`);
              }
            });
            
            // Sort each category by score
            for (const category of CATEGORIES) {
              grouped[category].sort((a, b) => (b.score || 0) - (a.score || 0));
            }
            
            console.log('[TodaySpendCarousels] Grouped items:', Object.entries(grouped).map(([k, v]) => `${k}: ${v.length}`));
            setPlacesByCategory(grouped);
            // Reset offsets when new data is loaded
            setCategoryOffsets({
              '奶茶': 0,
              '中餐': 0,
              '夜宵': 0,
              '甜品': 0,
            });
          } else {
            console.warn('[TodaySpendCarousels] No items or itemsByCategory found in response');
            console.warn('[TodaySpendCarousels] Response:', result);
            // Set empty state but still render placeholders
            setPlacesByCategory({
              '奶茶': [],
              '中餐': [],
              '夜宵': [],
              '甜品': [],
            });
          }
        } else {
          const errorText = await response.text();
          console.error(`[TodaySpendCarousels] ❌ API error: ${response.status} ${response.statusText}`);
          console.error(`[TodaySpendCarousels] Error response:`, errorText);
          // Set empty state on error
          setPlacesByCategory({
            '奶茶': [],
            '中餐': [],
            '烧烤火锅': [],
            '甜品': [],
          });
        }
      } catch (error) {
        console.error("[TodaySpendCarousels] ❌ Failed to fetch:", error);
        console.error("[TodaySpendCarousels] Error details:", error instanceof Error ? error.message : String(error));
        console.error("[TodaySpendCarousels] Error stack:", error instanceof Error ? error.stack : 'N/A');
        // Set empty state on exception
        setPlacesByCategory({
          '奶茶': [],
          '中餐': [],
          '夜宵': [],
          '甜品': [],
        });
      } finally {
        setLoading(false);
        console.log('[TodaySpendCarousels] Loading completed, loading state:', false);
      }
    }

    let timeoutId: NodeJS.Timeout | null = null;
    let intervalId: NodeJS.Timeout | null = null;
    
    const loadWithCleanup = async () => {
      // Clean up any pending timeouts
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      await loadRecommendations();
    };
    
    loadWithCleanup();
    intervalId = setInterval(loadWithCleanup, 30 * 60 * 1000);
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col md:grid md:grid-cols-2 gap-4 min-w-0">
        {CATEGORIES.map((category) => (
          <div key={category} className="rounded-sm p-3 md:p-4 bg-card border border-border/40 shadow-md min-h-[120px]">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-16 bg-muted rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Debug: log what we're about to render
  console.log('[TodaySpendCarousels] Rendering with placesByCategory:', placesByCategory);
  console.log('[TodaySpendCarousels] placesByCategory keys:', Object.keys(placesByCategory));
  console.log('[TodaySpendCarousels] placesByCategory type:', typeof placesByCategory);
  console.log('[TodaySpendCarousels] placesByCategory is object:', placesByCategory && typeof placesByCategory === 'object');
  
  for (const category of CATEGORIES) {
    const places = placesByCategory[category] || [];
    console.log(`[TodaySpendCarousels] Category "${category}": ${places.length} places`);
    if (places.length > 0) {
      console.log(`[TodaySpendCarousels] First place in "${category}":`, places[0]);
    } else {
      console.warn(`[TodaySpendCarousels] Category "${category}" has NO places!`);
      // Check if the key exists but is empty
      if (placesByCategory.hasOwnProperty(category)) {
        console.warn(`[TodaySpendCarousels] Key "${category}" exists but array is empty`);
      } else {
        console.warn(`[TodaySpendCarousels] Key "${category}" does NOT exist in placesByCategory`);
      }
    }
  }

  // Handler for "换一批" button
  const handleRefreshCategory = (category: string) => {
    setCategoryOffsets(prev => {
      const currentOffset = prev[category] || 0;
      const places = placesByCategory[category] || [];
      // Move to next batch (5 places at a time)
      // If we've reached the end, cycle back to start
      const nextOffset = (currentOffset + 5) % Math.max(places.length, 5);
      return {
        ...prev,
        [category]: nextOffset,
      };
    });
  };

  return (
    <div className="flex flex-col md:grid md:grid-cols-2 gap-4 min-w-0">
      {CATEGORIES.map((category) => {
        const places = placesByCategory[category] || [];
        const offset = categoryOffsets[category] || 0;
        console.log(`[TodaySpendCarousels] Rendering category "${category}" with ${places.length} places, offset: ${offset}`);
        // Always render, even if empty (will show fallback cards)
        return (
          <div key={category} className="min-w-0">
            <SpendCarousel
              category={category}
              places={places}
              offset={offset}
              onRefresh={() => handleRefreshCategory(category)}
            />
          </div>
        );
      })}
    </div>
  );
}
