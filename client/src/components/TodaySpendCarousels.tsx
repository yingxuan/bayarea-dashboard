/**
 * Today Spend Carousels Component
 * Displays 4 category carousels: 奶茶, 中餐, 咖啡, 夜宵
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

const CATEGORIES = ['奶茶', '中餐', '咖啡', '夜宵'] as const;

export default function TodaySpendCarousels() {
  const [placesByCategory, setPlacesByCategory] = useState<Record<string, SpendPlace[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecommendations() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/spend/today`;
        console.log('[TodaySpendCarousels] Fetching from:', apiUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(apiUrl, {
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
          
          // Use new itemsByCategory format if available, otherwise group legacy items
          if (result.itemsByCategory) {
            // Log the actual keys to debug encoding issues
            const keys = Object.keys(result.itemsByCategory);
            console.log('[TodaySpendCarousels] Raw itemsByCategory keys:', keys);
            console.log('[TodaySpendCarousels] Expected categories:', CATEGORIES);
            
            // Check each key and its places
            for (const [key, places] of Object.entries(result.itemsByCategory)) {
              console.log(`[TodaySpendCarousels] Key: "${key}", Places count: ${places.length}`);
              if (places.length > 0) {
                console.log(`[TodaySpendCarousels] First place category: "${places[0].category}", name: "${places[0].name}"`);
              }
            }
            
            // Strategy: Re-group by place.category field since keys might have encoding issues
            // This is more reliable than trying to match corrupted keys
            const regrouped: Record<string, SpendPlace[]> = {
              '奶茶': [],
              '中餐': [],
              '咖啡': [],
              '夜宵': [],
            };
            
            // Collect all places from itemsByCategory
            const allPlacesFromCategory: SpendPlace[] = [];
            for (const places of Object.values(result.itemsByCategory)) {
              allPlacesFromCategory.push(...places);
            }
            
            // Re-group by place.category
            allPlacesFromCategory.forEach(place => {
              const placeCategory = place.category;
              console.log(`[TodaySpendCarousels] Place "${place.name}" has category: "${placeCategory}"`);
              
              if (CATEGORIES.includes(placeCategory as any)) {
                regrouped[placeCategory].push(place);
              } else {
                console.warn(`[TodaySpendCarousels] Place "${place.name}" has unknown category: "${placeCategory}"`);
              }
            });
            
            // Sort each category by score
            for (const category of CATEGORIES) {
              regrouped[category].sort((a, b) => (b.score || 0) - (a.score || 0));
            }
            
            console.log('[TodaySpendCarousels] Regrouped categories:', Object.keys(regrouped));
            console.log('[TodaySpendCarousels] Regrouped counts:', Object.entries(regrouped).map(([k, v]) => `${k}: ${v.length}`));
            setPlacesByCategory(regrouped);
          } else if (result.items && Array.isArray(result.items)) {
            // Legacy format: group by category
            console.log('[TodaySpendCarousels] Using legacy items format, grouping by category');
            const grouped: Record<string, SpendPlace[]> = {
              '奶茶': [],
              '中餐': [],
              '咖啡': [],
              '夜宵': [],
            };
            result.items.forEach(place => {
              console.log(`[TodaySpendCarousels] Place: ${place.name}, category: "${place.category}"`);
              if (grouped[place.category]) {
                grouped[place.category].push(place);
              } else {
                console.warn(`[TodaySpendCarousels] Unknown category: "${place.category}"`);
              }
            });
            console.log('[TodaySpendCarousels] Grouped legacy items:', Object.entries(grouped).map(([k, v]) => `${k}: ${v.length}`));
            setPlacesByCategory(grouped);
          } else {
            console.warn('[TodaySpendCarousels] No items found in response');
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

  return (
    <div className="grid grid-cols-2 gap-4">
      {CATEGORIES.map((category) => {
        const places = placesByCategory[category] || [];
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
