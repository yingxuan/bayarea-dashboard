/**
 * Chihe Page (吃喝子页)
 * Complete food and drink recommendations page
 *
 * Features:
 * - Category tabs for switching between food types
 * - Full grid view of all places in each category
 * - Uses the same data source as TodaySpendCarousels
 * - Data Punk styling
 *
 * Categories:
 * - 奶茶 (Bubble Tea)
 * - 中餐 (Chinese Food)
 * - 夜宵 (Late Night)
 * - 新店打卡 (New Places)
 */

import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import {
  CategoryTabs,
  BackToHomeLink,
  BubbleTeaFull,
  ChineseFoodFull,
  LateNightFull,
  NewPlacesFull,
} from "@/components/chihe";
import type { CategoryType } from "@/components/chihe";
import { usePlacesCache } from "@/hooks/usePlacesCache";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

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

export default function Chihe() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const [activeCategory, setActiveCategory] = useState<CategoryType>('奶茶');

  // Use the same places cache hook as TodaySpendCarousels
  const { placesByCategory, loading } = usePlacesCache([
    '奶茶',
    '中餐',
    '夜宵',
    '新店打卡',
  ]);

  // Separate state for new places (fetched from API)
  const [newPlacesState, setNewPlacesState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    items: SpendPlace[];
    message?: string;
  }>({ status: 'idle', items: [] });

  // Fetch new places from API (same pattern as TodaySpendCarousels)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNewPlacesState({ status: 'loading', items: [] });
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
          category: '新店打卡',
          rating: entry.rating ?? 0,
          user_ratings_total: entry.userRatingCount ?? 0,
          maps_url: entry.placeId
            ? `https://www.google.com/maps/place/?q=place_id:${entry.placeId}`
            : '',
          city: entry.formattedAddress
            ? entry.formattedAddress.split(',')[0]
            : 'South Bay',
          photo_url: undefined,
          distance_miles: undefined,
          photo_local_url: undefined,
          badges: entry.why,
        }));
        setNewPlacesState({
          status: 'success',
          items: mapped,
          message: mapped.length === 0 ? '暂无新开店铺，稍后再来看看。' : undefined,
        });
      } catch (_error: unknown) {
        if (cancelled) return;
        setNewPlacesState({
          status: 'error',
          items: [],
          message: '新店打卡暂时不可用，请稍后刷新。',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Get places for the active category
  const getPlacesForCategory = (category: CategoryType): SpendPlace[] => {
    if (category === '新店打卡') {
      return newPlacesState.items;
    }
    return placesByCategory[category] || [];
  };

  // Calculate counts for each category
  const counts: Record<CategoryType, number> = {
    '奶茶': (placesByCategory['奶茶'] || []).length,
    '中餐': (placesByCategory['中餐'] || []).length,
    '夜宵': (placesByCategory['夜宵'] || []).length,
    '新店打卡': newPlacesState.items.length,
  };

  // Determine loading state for current category
  const isCurrentCategoryLoading =
    activeCategory === '新店打卡'
      ? newPlacesState.status === 'loading'
      : loading;

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-6 space-y-6">
          {/* Page Header */}
          <div className="space-y-4">
            <BackToHomeLink />

            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-bold font-mono">
                <span className="neon-text-blue">{t.chihe.title}</span>
                <span className="text-muted-foreground ml-2 text-lg font-normal">
                  {t.chihe.subtitle}
                </span>
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {t.chihe.desc}
              </p>
            </div>
          </div>

          {/* Category Tabs */}
          <CategoryTabs
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            counts={counts}
          />

          {/* Content based on active category */}
          <div className="mt-4">
            {activeCategory === '奶茶' && (
              <BubbleTeaFull
                places={getPlacesForCategory('奶茶')}
                loading={isCurrentCategoryLoading}
              />
            )}
            {activeCategory === '中餐' && (
              <ChineseFoodFull
                places={getPlacesForCategory('中餐')}
                loading={isCurrentCategoryLoading}
              />
            )}
            {activeCategory === '夜宵' && (
              <LateNightFull
                places={getPlacesForCategory('夜宵')}
                loading={isCurrentCategoryLoading}
              />
            )}
            {activeCategory === '新店打卡' && (
              <NewPlacesFull
                places={getPlacesForCategory('新店打卡')}
                loading={isCurrentCategoryLoading}
              />
            )}

            {/* Error message for new places */}
            {activeCategory === '新店打卡' && newPlacesState.message && (
              <div className="mt-4 text-center text-sm text-muted-foreground/70 font-mono">
                {newPlacesState.message}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground font-mono">
            <div>
              <span className="neon-text-blue font-bold">{t.home.footerTagline}</span>
              <span className="ml-2">| {t.chihe.subtitle}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>{t.home.footerSub.split('·')[0].trim()}</span>
              <span>|</span>
              <BackToHomeLink />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
