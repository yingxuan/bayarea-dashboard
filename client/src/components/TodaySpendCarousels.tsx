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

const CATEGORIES = ["新店打卡", "奶茶", "中餐", "夜宵"] as const;

export default function TodaySpendCarousels() {
  const { placesByCategory, loading, categoryOffsets, handleRefresh, debugByCategory } =
    usePlacesCache(["奶茶", "中餐", "夜宵", "新店打卡"]);
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
        if (!res.ok) throw new Error(`status ${res.status}`);

        const snapshot: {
          places: Array<{
            placeId: string;
            displayName: string;
            formattedAddress?: string;
            rating?: number;
            userRatingCount?: number;
            earliestReviewTime?: string;
            why?: string[];
          }>;
        } = await res.json();

        if (cancelled) return;

        const whyLabelMap: Record<string, string> = {
          "recent review": "近期评价",
          "first seen within 90d": "新发现",
          growing: "好评增长",
          "high rating": "评分好",
          "possibly new": "疑似新开",
        };

        const mapped: SpendPlace[] = (snapshot.places || []).map((entry) => {
          const badges: string[] = [];

          if (entry.earliestReviewTime) {
            const months = Math.floor(
              (Date.now() - new Date(entry.earliestReviewTime).getTime()) /
                (1000 * 60 * 60 * 24 * 30),
            );
            if (months <= 1) badges.push("刚开业");
            else if (months < 12) badges.push(`开业 ${months} 月`);
          }

          for (const item of entry.why ?? []) {
            if (badges.length >= 2) break;
            const label = whyLabelMap[item];
            if (label) badges.push(label);
          }

          return {
            id: entry.placeId,
            name: entry.displayName,
            category: "新店打卡",
            rating: entry.rating ?? 0,
            user_ratings_total: entry.userRatingCount ?? 0,
            maps_url: entry.placeId
              ? `https://www.google.com/maps/place/?q=place_id:${entry.placeId}`
              : "",
            city: entry.formattedAddress ? entry.formattedAddress.split(",")[0] : "South Bay",
            photo_url: undefined,
            distance_miles: undefined,
            photo_local_url: undefined,
            badges: badges.length > 0 ? badges : undefined,
          };
        });

        setNewPlacesState({
          status: "success",
          items: mapped,
          message: mapped.length === 0 ? "暂时没有新的值得打卡店铺。" : undefined,
        });
      } catch {
        if (cancelled) return;
        setNewPlacesState({
          status: "error",
          items: [],
          message: "新店数据暂时不可用，稍后再刷新。",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {CATEGORIES.map((category) => (
          <div
            key={category}
            className="min-h-[170px] rounded-[1.2rem] border border-white/10 bg-white/5 p-4"
          >
            <div className="animate-pulse">
              <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
              <div className="mb-3 h-4 w-2/3 rounded bg-muted/70" />
              <div className="h-24 rounded-2xl bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      {CATEGORIES.map((category) => {
        const isNewCategory = category === "新店打卡";
        const places = isNewCategory ? newPlacesState.items : (placesByCategory[category] || []);
        const offset = categoryOffsets[category] || 0;

        return (
          <div key={category} className="relative min-w-0">
            <SpendCarousel
              category={category}
              places={places}
              offset={offset}
              onRefresh={() => handleRefresh(category)}
              debugInfo={debugByCategory?.[category]}
            />
            {isNewCategory && newPlacesState.message ? (
              <div className="mt-2 px-2 text-center text-[11px] leading-5 text-muted-foreground/78">
                {newPlacesState.message}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
