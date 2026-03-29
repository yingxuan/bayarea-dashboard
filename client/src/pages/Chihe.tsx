import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CupSoda, Dices, MapPin, MoonStar, Sparkles, UtensilsCrossed } from "lucide-react";
import Navigation from "@/components/Navigation";
import PlaceCard from "@/components/chihe/PlaceCard";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { usePlacesCache } from "@/hooks/usePlacesCache";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserLocation } from "@/contexts/UserLocationContext";

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
  lat?: number;
  lng?: number;
  photo_url?: string;
  photo_local_url?: string;
  maps_url: string;
  city: string;
  badges?: string[];
  address?: string;
}

const CATEGORIES = ["新店打卡", "奶茶", "中餐", "夜宵"] as const;
const PERSONALIZATION_RADIUS_MILES = 10;
const INITIAL_CAROUSEL_ITEMS = 5;
const EXPANDED_CAROUSEL_ITEMS = 12;

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

function calculateDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function mergePlaces(primary: SpendPlace[], fallback: SpendPlace[]) {
  const merged = new Map<string, SpendPlace>();

  for (const place of fallback) {
    merged.set(place.id, place);
  }

  for (const place of primary) {
    const existing = merged.get(place.id);
    merged.set(place.id, {
      ...existing,
      ...place,
      lat: place.lat ?? existing?.lat,
      lng: place.lng ?? existing?.lng,
      address: place.address ?? existing?.address,
      photo_local_url: place.photo_local_url ?? existing?.photo_local_url,
      photo_url: place.photo_url ?? existing?.photo_url,
    });
  }

  return Array.from(merged.values());
}

function personalizePlaces(
  places: SpendPlace[],
  mode: "general" | "personalized",
  coordinates: { lat: number; lng: number } | null,
) {
  if (mode !== "personalized" || !coordinates) {
    return places;
  }

  const placesWithCoordinates = places.filter(
    (place) => typeof place.lat === "number" && typeof place.lng === "number",
  );

  if (placesWithCoordinates.length === 0) {
    return places;
  }

  return placesWithCoordinates
    .map((place) => ({
      ...place,
      distance_miles: parseFloat(
        calculateDistanceMiles(coordinates.lat, coordinates.lng, place.lat!, place.lng!).toFixed(1),
      ),
    }))
    .filter((place) => (place.distance_miles ?? Infinity) <= PERSONALIZATION_RADIUS_MILES)
    .sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity));
}

function deriveFallbackNewPlaces(placesByCategory: Record<string, SpendPlace[]>) {
  const seen = new Set<string>();
  const merged = ["奶茶", "中餐", "夜宵"].flatMap((category) => placesByCategory[category] || []);

  return merged
    .filter((place) => {
      if (seen.has(place.id)) return false;
      seen.add(place.id);
      return true;
    })
    .sort((a, b) => {
      const ratingDelta = (b.rating ?? 0) - (a.rating ?? 0);
      if (Math.abs(ratingDelta) > 0.2) return ratingDelta;
      return (a.user_ratings_total ?? 0) - (b.user_ratings_total ?? 0);
    })
    .slice(0, 12)
    .map((place) => ({
      ...place,
      category: "新店打卡",
      badges: place.badges?.length
        ? place.badges
        : ["最近值得试", place.user_ratings_total <= 120 ? "评论还不多" : "新发现"],
    }));
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

  useEffect(() => {
    setCurrent(null);
  }, [places]);

  const pickOne = () => {
    if (places.length === 0) return;
    const next = places[Math.floor(Math.random() * places.length)] || null;
    setCurrent(next);
  };

  if (current) {
    return <PlaceCard place={current} size="small" />;
  }

  return (
    <button
      type="button"
      onClick={pickOne}
      className="group relative flex h-full min-h-[15rem] min-w-0 flex-col justify-between overflow-hidden rounded-[1.05rem] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%),linear-gradient(145deg,rgba(14,165,233,0.18),rgba(251,191,36,0.12)_52%,rgba(255,255,255,0.05))] p-4 text-left shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/40"
    >
      <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-125" />
      <div className="absolute -bottom-8 -left-6 h-20 w-20 rounded-full bg-primary/20 blur-3xl transition-transform duration-300 group-hover:scale-110" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/72">
            Surprise Pick
          </div>
          <div className="mt-3 text-xl font-semibold text-foreground">
            {lang === "en" ? "Pick for Me" : "猜我喜欢"}
          </div>
          <div className="mt-1.5 text-sm text-foreground/72">
            {getCategoryLabel(category as (typeof CATEGORIES)[number], lang)}
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-black/20 text-white/88">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>

      <div className="relative">
        <div className="max-w-[15rem] text-sm leading-6 text-foreground/74">
          {lang === "en"
            ? "Roll once when you do not want to choose."
            : "懒得选的时候，直接随机给你一个。"}
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/18 bg-black/20 px-3 py-2 text-sm font-medium text-white/90 transition-colors group-hover:border-white/28">
          <Dices className="h-4 w-4" />
          {lang === "en" ? "Roll it" : "掷一下"}
        </div>
      </div>
    </button>
  );
}

function LocationActionButton({
  lang,
  onClick,
  disabled = false,
  label,
}: {
  lang: "zh" | "en";
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/12 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label ?? (lang === "en" ? "Share location" : "共享位置")}
    </button>
  );
}

function PersonalizationBanner({
  lang,
  isAuthenticated,
  status,
  permissionState,
  onRequestLocation,
}: {
  lang: "zh" | "en";
  isAuthenticated: boolean;
  status: "idle" | "requesting" | "granted" | "denied" | "unavailable" | "outside_bay_area";
  permissionState: PermissionState | "unsupported" | "unknown";
  onRequestLocation: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <div className="rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/78">
        {lang === "en"
          ? "Showing general Bay Area picks. Sign in and share location to see nearby spots."
          : "当前展示通用湾区结果。登录并授权定位后，会优先显示你附近的店。"}
      </div>
    );
  }

  if (status === "granted") {
    return (
      <div className="flex items-center gap-2 rounded-[1rem] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
        <MapPin className="h-4 w-4" />
        <span>
          {lang === "en"
            ? `Showing spots within ${PERSONALIZATION_RADIUS_MILES} miles of your location.`
            : `已按你当前位置做筛选，只显示 ${PERSONALIZATION_RADIUS_MILES} 英里内的店。`}
        </span>
      </div>
    );
  }

  if (status === "requesting") {
    return (
      <div className="flex flex-col gap-3 rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/78 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {lang === "en"
            ? "Checking your location for nearby recommendations..."
            : "正在读取你的位置，用来筛选附近的店。"}
        </span>
        <LocationActionButton
          lang={lang}
          onClick={onRequestLocation}
          disabled
          label={lang === "en" ? "Checking..." : "定位中..."}
        />
      </div>
    );
  }

  const bannerText =
    status === "outside_bay_area"
      ? lang === "en"
        ? "You are outside the Bay Area, so this page is showing general Bay Area picks."
        : "检测到你不在湾区，因此这里继续显示通用湾区结果。"
      : status === "denied"
        ? lang === "en"
          ? "Location sharing is off, so this page is showing general Bay Area picks."
          : "你没有共享位置，因此这里继续显示通用湾区结果。"
        : lang === "en"
          ? "Location is unavailable, so this page is showing general Bay Area picks."
          : "当前位置不可用，因此这里继续显示通用湾区结果。";

  const helperText =
    status === "denied" || permissionState === "denied"
      ? lang === "en"
        ? "If tapping does nothing, enable Location for this site in your browser settings and try again."
        : "如果点按钮没有弹窗，请到浏览器站点设置里打开定位权限后再试。"
      : status === "idle"
        ? lang === "en"
          ? "Tap once to use your current location and filter to nearby spots."
          : "点一次就会用你当前位置，把结果筛到附近。"
        : status === "unavailable" || permissionState === "unsupported"
          ? lang === "en"
            ? "Your browser may not support location here. Try Safari or Chrome over HTTPS."
            : "当前浏览器可能不支持定位。请用 Safari 或 Chrome，并确认是 HTTPS 页面。"
          : null;

  return (
    <div className="flex flex-col gap-3 rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/78 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div>{bannerText}</div>
        {helperText ? <div className="mt-1 text-xs text-foreground/55">{helperText}</div> : null}
      </div>
      <LocationActionButton
        lang={lang}
        onClick={onRequestLocation}
        label={
          status === "denied" || permissionState === "denied"
            ? lang === "en"
              ? "Retry after enabling"
              : "开权限后重试"
            : undefined
        }
      />
    </div>
  );
}

export default function Chihe() {
  const { lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { placesByCategory, loading } = usePlacesCache(["奶茶", "中餐", "夜宵", "新店打卡"]);
  const {
    status: locationStatus,
    mode: personalizationMode,
    coordinates,
    permissionState,
    requestLocation,
  } = useUserLocation();
  const effectivePersonalizationMode =
    isAuthenticated && personalizationMode === "personalized" ? "personalized" : "general";
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
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
          address: entry.formattedAddress,
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
                ? "No fresh snapshot right now. Showing recent worthwhile spots instead."
                : "当前没有新店快照，先显示最近值得试的店。"
              : undefined,
        });
      } catch {
        if (cancelled) return;
        setNewPlacesState({
          status: "error",
          items: [],
          message:
            lang === "en"
              ? "New spots are temporarily unavailable. Showing recent worthwhile spots instead."
              : "新店数据暂时不可用，先显示最近值得试的店。",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang]);

  const handleRequestLocation = () => {
    if (!isAuthenticated) {
      toast.info(lang === "en" ? "Sign in first to personalize nearby results." : "先登录，再用位置筛选附近的店。");
      return;
    }

    if (permissionState === "denied") {
      toast.error(
        lang === "en"
          ? "Location is blocked for this site. Enable it in your browser settings, then try again."
          : "这个站点的定位权限已经被浏览器拦住了。请先去浏览器设置里打开，再回来重试。",
      );
      return;
    }

    requestLocation();
  };

  const backupNewPlaces = useMemo(() => deriveFallbackNewPlaces(placesByCategory), [placesByCategory]);
  const fallbackNewPlaces = placesByCategory["新店打卡"]?.length
    ? placesByCategory["新店打卡"]
    : backupNewPlaces;

  const categorySections = useMemo(
    () =>
      CATEGORIES.map((category) => {
        const isNewCategory = category === "新店打卡";
        const rawPlaces = isNewCategory
          ? effectivePersonalizationMode === "personalized"
            ? mergePlaces(newPlacesState.items, fallbackNewPlaces)
            : newPlacesState.items.length > 0
              ? newPlacesState.items
              : fallbackNewPlaces
          : placesByCategory[category] || [];
        const places = personalizePlaces(rawPlaces, effectivePersonalizationMode, coordinates);
        const expanded = !!expandedCategories[category];
        const visibleCount = expanded ? EXPANDED_CAROUSEL_ITEMS : INITIAL_CAROUSEL_ITEMS;
        const visible = places.slice(0, visibleCount);

        return { category, isNewCategory, rawPlaces, places, visible, expanded };
      }),
    [
      coordinates,
      effectivePersonalizationMode,
      expandedCategories,
      fallbackNewPlaces,
      newPlacesState.items,
      placesByCategory,
    ],
  );

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="route-shell mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
          <PersonalizationBanner
            lang={lang}
            isAuthenticated={isAuthenticated}
            status={locationStatus}
            permissionState={permissionState}
            onRequestLocation={handleRequestLocation}
          />

          {categorySections.map(({ category, isNewCategory, rawPlaces, places, visible, expanded }) => (
            <section key={category} className="section-shell section-shell-food rounded-[1.2rem] p-4 md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-foreground">
                    {getCategoryLabel(category, lang)}
                  </h2>
                  {effectivePersonalizationMode === "personalized" && visible.length > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-100">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {lang === "en"
                          ? `Within ${PERSONALIZATION_RADIUS_MILES} mi`
                          : `${PERSONALIZATION_RADIUS_MILES} 英里内`}
                      </span>
                    </div>
                  ) : null}
                </div>

                {places.length > INITIAL_CAROUSEL_ITEMS ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCategories((current) => ({
                        ...current,
                        [category]: !current[category],
                      }))
                    }
                    className="rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:border-white/20 hover:bg-white/10"
                  >
                    {expanded
                      ? lang === "en"
                        ? "Less"
                        : "收起"
                      : lang === "en"
                        ? "More"
                        : "更多"}
                  </button>
                ) : null}
              </div>

              {loading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-60 animate-pulse rounded-[1.05rem] bg-muted/40" />
                  ))}
                </div>
              ) : visible.length > 0 ? (
                expanded ? (
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {visible.map((place) => (
                      <div key={place.id} className="min-w-0">
                        <PlaceCard place={place} size="small" />
                      </div>
                    ))}
                    <div className="min-w-0">
                      <GuessCard category={category} places={places} lang={lang} />
                    </div>
                  </div>
                ) : (
                  <Carousel opts={{ align: "start", dragFree: true }} className="w-full min-w-0">
                    <CarouselContent className="-ml-3 min-w-0">
                      {visible.map((place) => (
                        <CarouselItem
                          key={place.id}
                          className="min-w-0 shrink-0 basis-[74%] pl-3 sm:basis-[44%] lg:basis-[30%] xl:basis-[24%]"
                        >
                          <PlaceCard place={place} size="small" />
                        </CarouselItem>
                      ))}
                      <CarouselItem className="min-w-0 shrink-0 basis-[74%] pl-3 sm:basis-[44%] lg:basis-[30%] xl:basis-[24%]">
                        <GuessCard category={category} places={places} lang={lang} />
                      </CarouselItem>
                    </CarouselContent>
                  </Carousel>
                )
              ) : (
                <div className="rounded-[1.05rem] border border-dashed border-white/14 bg-white/[0.04] px-5 py-8 text-sm text-muted-foreground">
                  {effectivePersonalizationMode === "personalized"
                    ? lang === "en"
                      ? `No ${getCategoryLabel(category, lang).toLowerCase()} spots found within ${PERSONALIZATION_RADIUS_MILES} miles.`
                      : `${PERSONALIZATION_RADIUS_MILES} 英里内暂时没有可展示的${getCategoryLabel(category, lang)}结果。`
                    : lang === "en"
                      ? `No ${getCategoryLabel(category, lang).toLowerCase()} spots available right now.`
                      : `${getCategoryLabel(category, lang)}结果暂时不可用。`}
                </div>
              )}

              {isNewCategory && newPlacesState.message && rawPlaces.length === 0 ? (
                <div className="mt-3 text-sm text-muted-foreground">{newPlacesState.message}</div>
              ) : null}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
