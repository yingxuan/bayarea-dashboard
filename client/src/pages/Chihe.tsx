import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import {
  BackToHomeLink,
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

export default function Chihe() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const [activeCategory, setActiveCategory] = useState<CategoryType>("奶茶");

  const { placesByCategory, loading } = usePlacesCache(["奶茶", "中餐", "夜宵", "新店打卡"]);

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
          badges: entry.why,
        }));

        setNewPlacesState({
          status: "success",
          items: mapped,
          message: mapped.length === 0 ? "暂无新开店铺，稍后再来看。" : undefined,
        });
      } catch (_error: unknown) {
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

  const getPlacesForCategory = (category: CategoryType): SpendPlace[] => {
    if (category === "新店打卡") return newPlacesState.items;
    return placesByCategory[category] || [];
  };

  const counts: Record<CategoryType, number> = {
    奶茶: (placesByCategory["奶茶"] || []).length,
    中餐: (placesByCategory["中餐"] || []).length,
    夜宵: (placesByCategory["夜宵"] || []).length,
    新店打卡: newPlacesState.items.length,
  };

  const isCurrentCategoryLoading =
    activeCategory === "新店打卡" ? newPlacesState.status === "loading" : loading;

  const currentPlaces = getPlacesForCategory(activeCategory);
  const avgRating = useMemo(() => {
    if (currentPlaces.length === 0) return null;
    const total = currentPlaces.reduce((sum, place) => sum + (place.rating || 0), 0);
    return (total / currentPlaces.length).toFixed(1);
  }, [currentPlaces]);

  const currentMessage =
    activeCategory === "新店打卡" ? newPlacesState.message : undefined;

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-sm p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <BackToHomeLink />
              <div className="grid gap-4 md:grid-cols-[1.25fr_0.8fr] md:items-end">
                <div className="min-w-0">
                  <div className="eyebrow mb-3">Food Briefing</div>
                  <h1 className="text-2xl font-semibold leading-tight text-foreground md:text-[34px] md:leading-[1.08]">
                    {t.chihe.title}
                  </h1>
                  <div className="mt-2 text-sm font-medium text-primary/90 md:text-base">
                    {t.chihe.subtitle}
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    不只是列餐厅，而是帮你在通勤、聚餐、夜宵和新店尝鲜之间，更快做出今天这顿吃什么的判断。
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                      Today
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      先定场景，再看评分和距离，不把吃饭页面做成无止境瀑布流。
                    </div>
                  </div>
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">
                      Active Set
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      当前类别 {counts[activeCategory]} 家
                      {avgRating ? `，平均评分 ${avgRating}` : ""}
                      。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell section-shell-food rounded-sm p-3 md:p-4">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">Scope</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {Object.values(counts).reduce((sum, count) => sum + count, 0)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">四类候选池总量</div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">Focus</div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  当前在看 <span className="font-semibold text-foreground">{activeCategory}</span>
                </div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">Mode</div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  优先决策效率，其次才是探索感和视觉冲动。
                </div>
              </div>
            </div>

            <CategoryTabs
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              counts={counts}
            />
          </section>

          {activeCategory === "奶茶" ? (
            <BubbleTeaFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === "中餐" ? (
            <ChineseFoodFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === "夜宵" ? (
            <LateNightFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}
          {activeCategory === "新店打卡" ? (
            <NewPlacesFull places={currentPlaces} loading={isCurrentCategoryLoading} />
          ) : null}

          {activeCategory === "新店打卡" && currentMessage ? (
            <div className="rounded-sm border border-border/35 bg-card/45 px-4 py-3 text-sm text-muted-foreground">
              {currentMessage}
            </div>
          ) : null}

          <div className="border-t border-border/30 pt-6">
            <BackToHomeLink />
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-border py-6">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-xs font-mono text-muted-foreground/55 md:flex-row md:text-left">
            <div>
              <span className="text-sm font-semibold text-amber-300/85">{t.home.footerTagline}</span>
              <span className="ml-2">| {t.chihe.title} - {t.chihe.subtitle}</span>
            </div>
            <span>{t.home.footerSub}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
