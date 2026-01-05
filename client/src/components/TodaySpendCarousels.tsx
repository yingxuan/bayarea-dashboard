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

import SpendCarousel from "./SpendCarousel";
import { usePlacesCache } from "@/hooks/usePlacesCache";

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

// 2×2 grid: 奶茶/中餐, 夜宵/新店打卡
const CATEGORIES = ['奶茶', '中餐', '夜宵', '新店打卡'] as const;

export default function TodaySpendCarousels() {
  // Use local cache hook - loads from IndexedDB immediately, NEVER calls Places API
  const { placesByCategory, loading, cacheInfo, categoryOffsets, handleRefresh } = usePlacesCache(
    ['奶茶', '中餐', '夜宵', '新店打卡']
  );

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
        const places = placesByCategory[category] || [];
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
            />
            {/* Debug info (dev-only) - only for non-新店打卡 categories */}
            {debugMode && info && category !== '新店打卡' && (
              <div className="absolute top-1 right-1 text-[8px] font-mono bg-card/80 px-1 py-0.5 rounded border border-border/40 z-10">
                {info.mode} | {info.cacheAgeDays !== undefined ? `${info.cacheAgeDays}d` : 'N/A'} | {info.poolSize || 0}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
