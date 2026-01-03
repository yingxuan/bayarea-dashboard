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

// 2×2 grid: 奶茶/中餐, 夜宵/甜品
const CATEGORIES = ['奶茶', '中餐', '夜宵', '甜品'] as const;

export default function TodaySpendCarousels() {
  const [placesByCategory, setPlacesByCategory] = useState<Record<string, SpendPlace[]>>({});
  const [loading, setLoading] = useState(true);

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
        const apiUrl = new URL(`${config.apiBaseUrl}/api/spend/today`);
        if (userLocation) {
          apiUrl.searchParams.set('lat', userLocation.lat.toString());
          apiUrl.searchParams.set('lng', userLocation.lng.toString());
        }
        
        console.log('[TodaySpendCarousels] Fetching from:', apiUrl.toString());
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(apiUrl.toString(), {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log('[TodaySpendCarousels] Response status:', response.status, response.statusText);

        if (response.ok) {
          const result: SpendResponse = await response.json();
          console.log('[TodaySpendCarousels] Full API response:', result);
          console.log('[TodaySpendCarousels] API response summary:', {
            hasItemsByCategory: !!result.itemsByCategory,
            itemsByCategoryKeys: result.itemsByCategory ? Object.keys(result.itemsByCategory) : [],
            itemsByCategoryCounts: result.itemsByCategory ? Object.entries(result.itemsByCategory).map(([k, v]) => `${k}: ${v.length}`) : [],
            itemsCount: result.items?.length || 0,
            status: result.status,
          });
          
          // Prefer using items array - it's more reliable because each place has the correct category field
          // itemsByCategory keys might have encoding issues (even with English keys, we still prefer items)
          if (result.items && Array.isArray(result.items) && result.items.length > 0) {
            console.log('[TodaySpendCarousels] Using items array format (most reliable), grouping by place.category');
            const grouped: Record<string, SpendPlace[]> = {
              '奶茶': [],
              '中餐': [],
              '夜宵': [],
              '甜品': [],
            };
            
            result.items.forEach(place => {
              const placeCategory = place.category;
              
              // Frontend filter: Never render cards >10 miles (additional safety check)
              if (place.distance_miles !== undefined && place.distance_miles > 10) {
                console.warn(`[TodaySpendCarousels] Filtering out "${place.name}" - distance ${place.distance_miles} miles > 10 miles`);
                return;
              }
              
              console.log(`[TodaySpendCarousels] Place: ${place.name}, category: "${placeCategory}", distance: ${place.distance_miles} miles`);
              
              // Try exact match
              if (CATEGORIES.includes(placeCategory as any)) {
                grouped[placeCategory].push(place);
              } else {
                console.warn(`[TodaySpendCarousels] Unknown category: "${placeCategory}" for place "${place.name}"`);
              }
            });
            
            // Sort each category by score
            for (const category of CATEGORIES) {
              grouped[category].sort((a, b) => (b.score || 0) - (a.score || 0));
            }
            
            console.log('[TodaySpendCarousels] Grouped items:', Object.entries(grouped).map(([k, v]) => `${k}: ${v.length}`));
            setPlacesByCategory(grouped);
          } else if (result.itemsByCategory && Object.keys(result.itemsByCategory).length > 0) {
            // Fallback: try to use itemsByCategory (might have English keys or encoding issues)
            const keys = Object.keys(result.itemsByCategory);
            console.log('[TodaySpendCarousels] Using itemsByCategory with keys:', keys);
            console.log('[TodaySpendCarousels] Expected categories:', CATEGORIES);
            
            // Map English keys to Chinese categories if needed
            const keyMap: Record<string, string> = {
              'milk_tea': '奶茶',
              'chinese': '中餐',
              'coffee': '甜品', // Map coffee to 甜品 for 2×2 grid
              'late_night': '夜宵',
              'dessert': '甜品',
            };
            
            const normalized: Record<string, SpendPlace[]> = {
              '奶茶': [],
              '中餐': [],
              '夜宵': [],
              '甜品': [],
            };
            
            // Try to map itemsByCategory to normalized structure
            for (const [key, places] of Object.entries(result.itemsByCategory)) {
              const chineseCategory = keyMap[key] || key; // Use keyMap or try direct match
              if (CATEGORIES.includes(chineseCategory as any)) {
                normalized[chineseCategory] = places as SpendPlace[];
              } else {
                // If key doesn't match, try to infer from place.category fields
                console.log(`[TodaySpendCarousels] Key "${key}" doesn't match expected categories, inferring from place.category`);
                const placesArray = places as SpendPlace[];
                placesArray.forEach(place => {
                  if (CATEGORIES.includes(place.category as any)) {
                    normalized[place.category].push(place);
                  }
                });
              }
            }
            
            // Sort each category by score
            for (const category of CATEGORIES) {
              normalized[category].sort((a, b) => (b.score || 0) - (a.score || 0));
            }
            
            console.log('[TodaySpendCarousels] Normalized counts:', Object.entries(normalized).map(([k, v]) => `${k}: ${v.length}`));
            setPlacesByCategory(normalized);
          } else {
            console.warn('[TodaySpendCarousels] No items or itemsByCategory found in response');
            console.warn('[TodaySpendCarousels] Response:', result);
          }
        } else {
          const errorText = await response.text();
          console.error(`[TodaySpendCarousels] API error: ${response.status} ${response.statusText}`);
          console.error(`[TodaySpendCarousels] Error response:`, errorText);
        }
      } catch (error) {
        console.error("[TodaySpendCarousels] Failed to fetch:", error);
        console.error("[TodaySpendCarousels] Error details:", error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }

    loadRecommendations();
    const interval = setInterval(loadRecommendations, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {CATEGORIES.map((category) => (
          <div key={category} className="glow-border rounded-sm p-4 bg-card">
            <div className="animate-pulse">
              <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
              <div className="flex gap-4 overflow-x-auto">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-48 h-36 bg-muted rounded flex-shrink-0"></div>
                ))}
              </div>
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

  return (
    <div className="flex flex-col md:grid md:grid-cols-2 gap-4">
      {CATEGORIES.map((category) => {
        const places = placesByCategory[category] || [];
        console.log(`[TodaySpendCarousels] Rendering category "${category}" with ${places.length} places`);
        // Always render, even if empty (will show fallback cards)
        return (
          <SpendCarousel
            key={category}
            category={category}
            places={places}
          />
        );
      })}
    </div>
  );
}
