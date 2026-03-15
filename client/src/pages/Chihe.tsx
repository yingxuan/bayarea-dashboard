import { useEffect, useState } from "react";
import { CupSoda, Dices, MoonStar, Sparkles, UtensilsCrossed } from "lucide-react";
import Navigation from "@/components/Navigation";
import { BackToHomeLink, PlaceCard } from "@/components/chihe";
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

const CATEGORIES = ["新店打卡", "奶茶", "中餐", "夜宵"] as const;

const CATEGORY_ICON = {
  新店打卡: Sparkles,
  奶茶: CupSoda,
  中餐: UtensilsCrossed,
  夜宵: MoonStar,
} as const;

function getCategoryLabel(category: (typeof CATEGORIES)[number], lang: "zh" | "en") {
  if (lang === "en") {
    switch (category) {
      case "新店打卡":
        return "New Spots";
      case "奶茶":
        return "Bubble Tea";
      case "中餐":
        return "Chinese Food";
      case "夜宵":
        return "Late Night";
    }
  }

  return category;
}

function GuessCard({
  category,
  places,
  lang,
}: {
  category: string;
  places: SpendPlace[];
  lang: "zh" | "en";
}) {
  const [current, setCurrent] = useState<SpendPlace | null>(null);
  const Icon = CATEGORY_ICON[category as keyof typeof CATEGORY_ICON] || Sparkles;

  const pickOne = () => {
    if (places.length === 0) return;
    const next = places[Math.floor(Math.random() * places.length)] || null;
    setCurrent(next);
  };

  if (current) {
    return <PlaceCard place={current} size="medium" />;
  }

  return (
    <button
      type="button"
      onClick={pickOne}
      className="group relative flex h-full min-h-[22rem] flex-col justify-between overflow-hidden rounded-[1.15rem] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%),linear-gradient(145deg,rgba(14,165,233,0.18),rgba(251,191,36,0.12)_52%,rgba(255,255,255,0.05))] p-5 text-left shadow-[0_20px_50px_rgba(15,23,42,0.22)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/40"
    >
      <div className="absolute right-4 top-4 h-20 w-20 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-125" />
      <div className="absolute -bottom-8 -left-6 h-24 w-24 rounded-full bg-primary/20 blur-3xl transition-transform duration-300 group-hover:scale-110" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/15 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/72">
            Surprise Pick
          </div>
          <div className="mt-4 text-2xl font-semibold text-foreground">
            {lang === "en" ? "Pick for Me" : "猜我喜欢"}
          </div>
          <div className="mt-2 text-sm text-foreground/72">{getCategoryLabel(category as (typeof CATEGORIES)[number], lang)}</div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/20 text-white/88">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="relative">
        <div className="max-w-[18rem] text-sm leading-6 text-foreground/74">
          {lang === "en"
            ? "When you do not want to choose, roll once and go with the best candidate."
            : "懒得选的时候，直接丢给你一个这类里最值得去的选项。"}
        </div>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/18 bg-black/20 px-4 py-2 text-sm font-medium text-white/90 transition-colors group-hover:border-white/28">
          <Dices className="h-4 w-4" />
          {lang === "en" ? "Roll it" : "掷一下"}
        </div>
      </div>
    </button>
  );
}

export default function Chihe() {
  const { lang } = useLanguage();
  const t = useT(lang);
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
          message:
            mapped.length === 0
              ? lang === "en"
                ? "No new spots right now."
                : "暂时没有新店，稍后再看。"
              : undefined,
        });
      } catch {
        if (cancelled) return;
        setNewPlacesState({
          status: "error",
          items: [],
          message: lang === "en" ? "New spots are temporarily unavailable." : "新店数据暂时不可用。",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang]);

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
          </section>

          {CATEGORIES.map((category) => {
            const isNewCategory = category === "新店打卡";
            const places = isNewCategory ? newPlacesState.items : placesByCategory[category] || [];
            const visible = places.slice(0, 5);

            return (
              <section key={category} className="section-shell section-shell-food rounded-[1.2rem] p-5">
                <h2 className="mb-4 text-xl font-semibold text-foreground">
                  {getCategoryLabel(category, lang)}
                </h2>
                {loading ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="h-80 animate-pulse rounded-[1.15rem] bg-muted/40" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {visible.map((place) => (
                        <PlaceCard key={place.id} place={place} size="medium" />
                      ))}
                      <GuessCard category={category} places={places} lang={lang} />
                    </div>
                    {isNewCategory && newPlacesState.message ? (
                      <div className="mt-3 text-sm text-muted-foreground">{newPlacesState.message}</div>
                    ) : null}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
