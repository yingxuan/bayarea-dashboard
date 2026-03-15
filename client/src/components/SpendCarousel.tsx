import { useEffect, useMemo, useRef, useState } from "react";
import {
  CupSoda,
  ExternalLink,
  MapPin,
  MoonStar,
  RefreshCcw,
  Sparkles,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { config } from "@/config";
import { enrichPlace } from "@/lib/places/placeEnricher";
import { getEnrichmentKey, getEnriched } from "@/lib/places/enrichmentCache";

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

interface PlacesDebugInfo {
  region?: string;
}

interface SpendCarouselProps {
  category: string;
  places: SpendPlace[];
  fallbackImage?: string;
  offset?: number;
  onRefresh?: () => void;
  debugInfo?: PlacesDebugInfo;
  showRandomTile?: boolean;
}

const CATEGORY_FALLBACK_IMAGES: Record<string, string[]> = {
  奶茶: [
    "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=800&h=600&fit=crop",
  ],
  中餐: [
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1525755662776-9d797cd77072?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=800&h=600&fit=crop",
  ],
  夜宵: [
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=800&h=600&fit=crop",
  ],
  新店打卡: [
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
  ],
};

const CATEGORY_CTA: Record<string, string> = {
  奶茶: "换一批",
  中餐: "换一批",
  夜宵: "换一批",
  新店打卡: "换一批",
};

const CATEGORY_ICON: Record<string, typeof CupSoda> = {
  奶茶: CupSoda,
  中餐: UtensilsCrossed,
  夜宵: MoonStar,
  新店打卡: Sparkles,
};

function getFallbackImage(category: string, place: SpendPlace, fallbackImage?: string) {
  if (fallbackImage) return fallbackImage;
  const images = CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES["中餐"];
  const seed = `${place.id || ""}-${place.name}-${place.city}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return images[Math.abs(hash) % images.length];
}

function PlaceTile({
  place,
  category,
  fallbackImage,
  enrichment,
  photoOverride,
}: {
  place: SpendPlace;
  category: string;
  fallbackImage?: string;
  enrichment?: { rating: number; userRatingCount: number; photoUrl?: string };
  photoOverride?: string;
}) {
  const imageUrl =
    photoOverride ||
    place.photo_local_url ||
    enrichment?.photoUrl ||
    place.photo_url ||
    getFallbackImage(category, place, fallbackImage);
  const rating = enrichment?.rating ?? place.rating;
  const ratingCount = enrichment?.userRatingCount ?? place.user_ratings_total;

  return (
    <a
      href={place.maps_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-[16.5rem] overflow-hidden rounded-[1.15rem] border border-white/10 bg-white/5 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.075] hover:shadow-[0_18px_40px_rgba(8,10,20,0.24)]"
    >
      <div className="relative h-40 overflow-hidden bg-muted">
        <img
          src={imageUrl}
          alt={place.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            const fallback = getFallbackImage(category, place, fallbackImage);
            if (target.src !== fallback) target.src = fallback;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <div className="text-[15px] font-semibold leading-tight drop-shadow-md">{place.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/78">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
              <span className="tabular-nums">{rating > 0 ? rating.toFixed(1) : "-"}</span>
              {ratingCount > 0 ? <span>· {ratingCount}</span> : null}
            </span>
            {place.distance_miles !== undefined ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span className="tabular-nums">{place.distance_miles.toFixed(1)} mi</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/75">
            {place.city}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/6 text-foreground/72 transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <ExternalLink className="h-3.5 w-3.5" />
        </div>
      </div>
    </a>
  );
}

function RandomTile({
  category,
  pool,
  onPick,
  currentPlace,
  picking,
}: {
  category: string;
  pool: SpendPlace[];
  onPick: () => void;
  currentPlace: SpendPlace | null;
  picking: boolean;
}) {
  const Icon = CATEGORY_ICON[category] || Sparkles;

  if (currentPlace) {
    return (
      <div className="w-[16.5rem]">
        <PlaceTile place={currentPlace} category={category} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={picking || pool.length === 0}
      className="group flex h-full w-[16.5rem] flex-col justify-between overflow-hidden rounded-[1.15rem] border border-dashed border-white/14 bg-gradient-to-br from-white/8 to-white/[0.03] p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary/35 hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">猜我喜欢</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/14 text-primary">
          <Icon className={`h-4 w-4 ${picking ? "animate-pulse" : ""}`} />
        </div>
      </div>
      <div className="mt-5 text-sm leading-6 text-muted-foreground/82">
        {picking ? "挑选中..." : "不想选就直接给我一个。"}
      </div>
      <div className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-primary/88">
        {picking ? "正在选..." : "试试手气"}
      </div>
    </button>
  );
}

export default function SpendCarousel({
  category,
  places,
  fallbackImage,
  offset = 0,
  onRefresh,
  debugInfo,
  showRandomTile = true,
}: SpendCarouselProps) {
  const [enrichedPlaces, setEnrichedPlaces] = useState<
    Map<string, { rating: number; userRatingCount: number; photoUrl?: string }>
  >(new Map());
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  const [isPickingRandom, setIsPickingRandom] = useState(false);
  const [randomPlace, setRandomPlace] = useState<SpendPlace | null>(null);
  const [lastPickedId, setLastPickedId] = useState<string | null>(null);
  const inflightPhotos = useRef<Set<string>>(new Set());

  const topPlaces = useMemo(() => {
    if (places.length <= 10) return places;
    const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
    if (normalizedOffset + 10 <= places.length) {
      return places.slice(normalizedOffset, normalizedOffset + 10);
    }
    const fromEnd = places.slice(normalizedOffset);
    const fromStart = places.slice(0, 10 - fromEnd.length);
    return [...fromEnd, ...fromStart];
  }, [offset, places]);

  useEffect(() => {
    async function loadEnrichment() {
      const entries = await Promise.all(
        topPlaces.map(async (place) => {
          const key = getEnrichmentKey(place.id, place.name, place.city);
          const cached = await getEnriched(key);
          if (cached) {
            return [
              key,
              {
                rating: cached.rating,
                userRatingCount: cached.userRatingCount,
                photoUrl: cached.photo?.photoUrl,
              },
            ] as const;
          }

          try {
            const enriched = await enrichPlace(place.name, place.city, place.id);
            if (!enriched) return null;
            return [
              key,
              {
                rating: enriched.rating,
                userRatingCount: enriched.userRatingCount,
                photoUrl: enriched.photo?.photoUrl,
              },
            ] as const;
          } catch {
            return null;
          }
        }),
      );

      const nextMap = new Map<string, { rating: number; userRatingCount: number; photoUrl?: string }>();
      entries.forEach((entry) => {
        if (entry) nextMap.set(entry[0], entry[1]);
      });
      setEnrichedPlaces(nextMap);
    }

    if (topPlaces.length > 0) {
      void loadEnrichment();
    }
  }, [topPlaces]);

  useEffect(() => {
    topPlaces.forEach((place) => {
      if (!place.id || place.photo_local_url || photoOverrides[place.id]) return;
      if (inflightPhotos.current.has(place.id)) return;
      inflightPhotos.current.add(place.id);

      const url = `${config.apiBaseUrl}/api/spend/place-photo?place_id=${encodeURIComponent(place.id)}`;
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.photo_local_url) {
            setPhotoOverrides((prev) => ({
              ...prev,
              [place.id]: data.photo_local_url,
            }));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          setTimeout(() => inflightPhotos.current.delete(place.id), 1000);
        });
    });
  }, [photoOverrides, topPlaces]);

  const handleRandomPick = () => {
    if (isPickingRandom || places.length === 0) return;
    setIsPickingRandom(true);

    window.setTimeout(() => {
      const pool = places.filter((place) => place.id !== lastPickedId);
      const candidates = pool.length > 0 ? pool : places;
      const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? null;
      setRandomPlace(picked);
      setLastPickedId(picked?.id ?? null);
      setIsPickingRandom(false);
    }, 650);
  };

  if (places.length === 0) {
    return (
      <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-foreground">{category}</div>
        <div className="mt-2 text-sm text-muted-foreground/78">暂时没有可用推荐。</div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-white/5 p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{category}</h3>
        </div>

        <div className="flex items-center gap-2">
          {debugInfo?.region ? (
            <span className="signal-chip hidden md:inline-flex">
              <span className="signal-dot bg-amber-400 text-amber-400" />
              {debugInfo.region}
            </span>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 text-xs font-medium text-foreground/78 transition-colors hover:border-white/24 hover:text-foreground"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {CATEGORY_CTA[category] || "换一批"}
            </button>
          ) : null}
        </div>
      </div>

      <Carousel opts={{ align: "start", dragFree: true }}>
        <CarouselContent className="-ml-3">
          {topPlaces.slice(0, 5).map((place) => {
            const key = getEnrichmentKey(place.id, place.name, place.city);
            return (
              <CarouselItem key={`${place.id || place.name}-${category}`} className="basis-auto pl-3">
                <PlaceTile
                  place={place}
                  category={category}
                  fallbackImage={fallbackImage}
                  enrichment={enrichedPlaces.get(key)}
                  photoOverride={place.id ? photoOverrides[place.id] : undefined}
                />
              </CarouselItem>
            );
          })}

          {showRandomTile ? (
            <CarouselItem className="basis-auto pl-3">
              <RandomTile
                category={category}
                pool={places}
                onPick={handleRandomPick}
                currentPlace={randomPlace}
                picking={isPickingRandom}
              />
            </CarouselItem>
          ) : null}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
