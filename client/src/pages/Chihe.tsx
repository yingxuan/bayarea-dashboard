import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import {
  BackToHomeLink,
  BlindBoxFull,
  BubbleTeaFull,
  CategoryTabs,
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

const BLIND_BOX = "\u76f2\u76d2";
const BUBBLE_TEA = "\u5976\u8336";
const CHINESE_FOOD = "\u4e2d\u9910";
const LATE_NIGHT = "\u591c\u5bb5";
const NEW_PLACES = "\u65b0\u5e97\u6253\u5361";

export default function Chihe() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const [activeCategory, setActiveCategory] = useState<CategoryType>(BLIND_BOX as CategoryType);

  const { placesByCategory, loading } = usePlacesCache([BUBBLE_TEA, CHINESE_FOOD, LATE_NIGHT, NEW_PLACES]);

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
            why?: string[];
          }>;
        } = await res.json();

        if (cancelled) return;

        const mapped: SpendPlace[] = (snapshot.places || []).map((entry) => ({
          id: entry.placeId,
          name: entry.displayName,
          category: NEW_PLACES,
          rating: entry.rating ?? 0,
          user_ratings_total: entry.userRatingCount ?? 0,
          maps_url: entry.placeId
            ? `https://www.google.com/maps/place/?q=place_id:${entry.placeId}`
            : "",
          city: entry.formattedAddress ? entry.formattedAddress.split(",")[0] : "South Bay",
          photo_url: undefined,
          distance_miles: undefined,
          photo_local_url: undefined,
          badges: entry.why,
        }));

        setNewPlacesState({
          status: "success",
          items: mapped,
          message: mapped.length === 0 ? "\u6682\u65e0\u65b0\u5e97\uff0c\u7a0d\u540e\u518d\u770b\u3002" : undefined,
        });
      } catch (_error: unknown) {
        if (cancelled) return;
        setNewPlacesState({
          status: "error",
          items: [],
          message: "\u65b0\u5e97\u6570\u636e\u6682\u65f6\u4e0d\u53ef\u7528\u3002",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const getPlacesForCategory = (category: CategoryType): SpendPlace[] => {
    if (category === (NEW_PLACES as CategoryType)) return newPlacesState.items;
    if (category === (BLIND_BOX as CategoryType)) {
      return [
        ...(placesByCategory[BUBBLE_TEA] || []),
        ...(placesByCategory[CHINESE_FOOD] || []),
        ...(placesByCategory[LATE_NIGHT] || []),
        ...newPlacesState.items,
      ];
    }
    return placesByCategory[category] || [];
  };

  const blindBoxPlaces = getPlacesForCategory(BLIND_BOX as CategoryType);

  const counts: Record<CategoryType, number> = {
    [BLIND_BOX]: blindBoxPlaces.length,
    [BUBBLE_TEA]: (placesByCategory[BUBBLE_TEA] || []).length,
    [CHINESE_FOOD]: (placesByCategory[CHINESE_FOOD] || []).length,
    [LATE_NIGHT]: (placesByCategory[LATE_NIGHT] || []).length,
    [NEW_PLACES]: newPlacesState.items.length,
  } as Record<CategoryType, number>;

  const isCurrentCategoryLoading =
    activeCategory === (NEW_PLACES as CategoryType)
      ? newPlacesState.status === "loading"
      : activeCategory === (BLIND_BOX as CategoryType)
        ? loading || newPlacesState.status === "loading"
        : loading;

  const currentPlaces = getPlacesForCategory(activeCategory);
  const currentMessage = activeCategory === (NEW_PLACES as CategoryType) ? newPlacesState.message : undefined;

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="route-shell mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-[1.35rem] p-4 md:p-5">
            <BackToHomeLink />
            <h1 className="mt-4 text-2xl font-semibold leading-tight text-foreground md:text-[34px] md:leading-[1.08]">
              {t.chihe.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
              \u5207\u5206\u7c7b\uff0c\u76f4\u63a5\u9009\u5e97\u3002
            </p>
          </section>

          <section className="section-shell section-shell-food rounded-sm p-3 md:p-4">
            <CategoryTabs
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              counts={counts}
            />
          </section>

          {activeCategory === (BLIND_BOX as CategoryType) ? (
            <BlindBoxFull places={blindBoxPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === (BUBBLE_TEA as CategoryType) ? (
            <BubbleTeaFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === (CHINESE_FOOD as CategoryType) ? (
            <ChineseFoodFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === (LATE_NIGHT as CategoryType) ? (
            <LateNightFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === (NEW_PLACES as CategoryType) ? (
            <NewPlacesFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}

          {activeCategory === (NEW_PLACES as CategoryType) && currentMessage ? (
            <div className="rounded-sm border border-border/35 bg-card/45 px-4 py-3 text-sm text-muted-foreground">
              {currentMessage}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
