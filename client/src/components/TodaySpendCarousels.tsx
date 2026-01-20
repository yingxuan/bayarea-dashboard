/**
 * Today Spend Carousels Component
 * Displays 2×2 grid: 奶茶/中餐, 夜宵/新店打卡
 * 
 * Requirements:
 * - 4 horizontal image carousels
 * - Each category shows 6 places
 * - Never show empty sections
 * - Uses local cache for instant loading
 */

import { useEffect, useState } from "react";
import SpendCarousel from "./SpendCarousel";
import { usePlacesCache } from "@/hooks/usePlacesCache";
import { config } from "@/config";

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
  badges?: string[];
}

// 2×2 grid: 奶茶/中餐, 夜宵/新店打卡
const CATEGORIES = ['奶茶', '中餐', '夜宵', '新店打卡'] as const;

export default function TodaySpendCarousels() {
  // Use local cache hook - loads from IndexedDB immediately, NEVER calls Places API
  const { placesByCategory, loading, cacheInfo, categoryOffsets, handleRefresh, debugByCategory } = usePlacesCache(
    ['奶茶', '中餐', '夜宵', '新店打卡']
  );
  const [newPlacesState, setNewPlacesState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    items: SpendPlace[];
    message?: string;
  }>({ status: "idle", items: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNewPlacesState({ status: "loading", items: [] });
      try {
        const res = await fetch(`${config.apiBaseUrl}/api/spend/new-places`);
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const snapshot: {
          places: Array<{
            placeId: string;
            displayName: string;
            formattedAddress?: string;
            rating?: number;
            userRatingCount?: number;
            why?: string[];
          }>;
        } = await res.json();
        if (cancelled) return;
        const mapped: SpendPlace[] = (snapshot.places || []).map((entry) => ({
          id: entry.placeId,
          name: entry.displayName,
          category: "新店打卡",
          rating: entry.rating ?? 0,
          user_ratings_total: entry.userRatingCount ?? 0,
          maps_url: entry.placeId ? `https://www.google.com/maps/place/?q=place_id:${entry.placeId}` : "",
          city: entry.formattedAddress ? entry.formattedAddress.split(",")[0] : "South Bay",
          photo_url: undefined,
          distance_miles: undefined,
          photo_local_url: undefined,
          badges: entry.why,
        }));
        setNewPlacesState({
          status: "success",
          items: mapped,
          message: mapped.length === 0 ? "暂无新开店铺，稍后再来看看。" : undefined,
        });
      } catch (error: any) {
        if (cancelled) return;
        setNewPlacesState({
          status: "error",
          items: [],
          message: "新店打卡暂时不可用，请稍后刷新。",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debug info (dev-only)
  const isDev = import.meta.env.DEV;
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const debugMode = urlParams?.get('debug') === '1' || isDev;

  // Handler for "换一批" button - cache-only rotation (no API calls)
  const handleRefreshCategory = async (category: string) => {
    await handleRefresh(category);
  };

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

  return (
    <div className="flex flex-col md:grid md:grid-cols-2 gap-4 min-w-0">
      {CATEGORIES.map((category) => {
        const isNewCategory = category === '新店打卡';
        const places = isNewCategory ? newPlacesState.items : (placesByCategory[category] || []);
        const offset = categoryOffsets[category] || 0;
        const info = cacheInfo[category];
        
        // Always render, even if empty (will show fallback cards)
        return (
          <div key={category} className="min-w-0 relative">
            <SpendCarousel
              category={category}
              places={places}
              offset={offset}
              onRefresh={() => handleRefreshCategory(category)}
              debugInfo={debugByCategory?.[category]}
            />
            {isNewCategory && newPlacesState.message && (
              <div className="mt-2 text-[10px] text-center text-foreground/70 px-2">
                {newPlacesState.message}
              </div>
            )}
            {/* Debug info (dev-only) - only for non-新店打卡 categories */}
            {/* {debugMode && info && category !== '新店打卡' && (
              <div className="absolute top-1 right-1 text-[8px] font-mono bg-card/80 px-1 py-0.5 rounded border border-border/40 z-10">
                {info.mode} | {info.cacheAgeDays !== undefined ? `${info.cacheAgeDays}d` : 'N/A'} | {info.poolSize || 0}
              </div>
            )} */}
          </div>
        );
      })}
    </div>
  );
}
