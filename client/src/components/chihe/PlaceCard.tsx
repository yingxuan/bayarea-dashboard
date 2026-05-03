import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin, Star } from "lucide-react";
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
  address?: string;
  popularDishes?: string[];
}

interface PlaceCardProps {
  place: SpendPlace;
  size?: "small" | "medium" | "large";
  showCategory?: boolean;
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

function getFallbackImageUrl(place: SpendPlace): string {
  const seed = `${place.id || ""}-${place.name}-${place.city}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const images = CATEGORY_FALLBACK_IMAGES[place.category] || CATEGORY_FALLBACK_IMAGES["中餐"];
  return images[Math.abs(hash) % images.length];
}

const inflight = new Set<string>();

export default function PlaceCard({
  place,
  size = "medium",
  showCategory = false,
}: PlaceCardProps) {
  const staticPhoto =
    place.photo_local_url || (place.photo_url?.startsWith("/") ? place.photo_url : undefined);
  const [fetchedPhoto, setFetchedPhoto] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (staticPhoto || fetchedRef.current || !place.id || inflight.has(place.id)) return;
    if (!/^[A-Za-z0-9_-]{10,}$/.test(place.id) || place.id.startsWith("seed_")) return;

    fetchedRef.current = true;
    inflight.add(place.id);
    fetch(`${config.apiBaseUrl}/api/spend/place-photo?place_id=${encodeURIComponent(place.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.photo_local_url) setFetchedPhoto(data.photo_local_url);
      })
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => inflight.delete(place.id), 5000);
      });
  }, [place.id, staticPhoto]);

  const imageUrl = staticPhoto || fetchedPhoto || getFallbackImageUrl(place);
  const compactBadges = (place.badges || []).slice(0, 2);
  const shortAddress = place.address?.split(",")[0]?.trim() || place.city;

  const sizeClasses = {
    small: {
      image: "h-28",
      title: "text-[14px]",
      padding: "p-3",
      action: "px-2.5 py-1 text-[11px]",
    },
    medium: {
      image: "h-36",
      title: "text-[15px]",
      padding: "p-4",
      action: "px-3 py-1.5 text-xs",
    },
    large: {
      image: "h-48",
      title: "text-[18px]",
      padding: "p-4",
      action: "px-3 py-1.5 text-xs",
    },
  } as const;

  const classes = sizeClasses[size];

  return (
    <a
      href={place.maps_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.05rem] border border-white/10 bg-white/5 transition-all duration-200 hover:-translate-y-1 hover:border-white/22 hover:bg-white/[0.075] hover:shadow-[0_18px_36px_rgba(8,10,20,0.2)]"
    >
      <div className={`relative w-full overflow-hidden bg-muted ${classes.image}`}>
        <img
          src={imageUrl}
          alt={place.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            const fallback = getFallbackImageUrl(place);
            if (target.src !== fallback) target.src = fallback;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/74 via-black/18 to-transparent" />
        <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/34 text-white/82 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <ExternalLink className="h-3.5 w-3.5" />
        </div>
        {showCategory ? (
          <div className="absolute left-3 top-3 rounded-full border border-white/12 bg-black/38 px-2.5 py-1 text-[11px] text-white/84 backdrop-blur-sm">
            {place.category}
          </div>
        ) : null}
      </div>

      <div className={`flex flex-1 min-w-0 flex-col ${classes.padding}`}>
        <div className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground/75">
          {place.city}
        </div>
        <h3 className={`mt-1.5 line-clamp-2 min-w-0 font-semibold leading-5 text-foreground ${classes.title}`}>
          {place.name}
        </h3>

        <div className="mt-2 line-clamp-1 text-[12px] text-muted-foreground/78">{shortAddress}</div>

        {compactBadges.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {compactBadges.map((badge) => (
              <span
                key={`${place.id}-${badge}`}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-foreground/76"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}

        {place.popularDishes?.length ? (
          <div className="mt-2 text-[12px] leading-5 text-foreground/78">
            <span className="text-muted-foreground/70">推荐点单：</span>
            {place.popularDishes.slice(0, 3).join(" · ")}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="tabular-nums">{place.rating > 0 ? place.rating.toFixed(1) : "-"}</span>
            <span className="text-muted-foreground/70">({place.user_ratings_total})</span>
          </span>

          {place.distance_miles !== undefined ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              <span className="tabular-nums">{place.distance_miles.toFixed(1)} mi</span>
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 font-medium text-foreground/82 transition-colors group-hover:border-primary/30 group-hover:text-primary ${classes.action}`}
          >
            打开地图
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
}
