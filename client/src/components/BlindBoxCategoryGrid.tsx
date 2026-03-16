import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Shuffle, Star } from "lucide-react";

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
}

interface BlindBoxCategoryGridProps {
  placesByCategory: Record<string, SpendPlace[]>;
  titleMap?: Record<string, string>;
}

function pickRandomIndex(length: number, exclude?: number) {
  if (length <= 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (exclude === undefined) return next;
  while (next === exclude) next = Math.floor(Math.random() * length);
  return next;
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
};

function getFallbackImage(place: SpendPlace): string {
  const seed = `${place.id || ""}-${place.name}-${place.city}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const images = CATEGORY_FALLBACK_IMAGES[place.category] || CATEGORY_FALLBACK_IMAGES["中餐"];
  return images[Math.abs(hash) % images.length];
}

function BlindCard({
  title,
  places,
}: {
  title: string;
  places: SpendPlace[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(() =>
    places.length > 0 ? pickRandomIndex(places.length) : 0,
  );

  const selectedPlace = useMemo(() => {
    if (places.length === 0) return null;
    return places[Math.min(selectedIndex, places.length - 1)];
  }, [places, selectedIndex]);

  return (
    <section className="rounded-[1.15rem] border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => setSelectedIndex((current) => pickRandomIndex(places.length, current))}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 text-xs font-medium text-foreground/78 transition-colors hover:border-white/24 hover:text-foreground"
        >
          <Shuffle className="h-3.5 w-3.5" />
          猜我喜欢
        </button>
      </div>

      {selectedPlace ? (
        <a
          href={selectedPlace.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block overflow-hidden rounded-[1rem] border border-white/10 bg-background/35 transition-all hover:border-primary/35 hover:bg-background/55"
        >
          <div className="relative h-40 overflow-hidden bg-muted">
            <img
              src={selectedPlace.photo_local_url || selectedPlace.photo_url || getFallbackImage(selectedPlace)}
              alt={selectedPlace.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              loading="lazy"
              onError={(event) => {
                const target = event.target as HTMLImageElement;
                const fallback = getFallbackImage(selectedPlace);
                if (target.src !== fallback) target.src = fallback;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/74 via-black/18 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="line-clamp-2 text-base font-semibold text-white">
                {selectedPlace.name}
              </div>
              <div className="mt-1 text-sm text-white/78">{selectedPlace.city}</div>
            </div>
            <div className="absolute right-3 top-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/80 transition-colors group-hover:border-primary/30 group-hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {selectedPlace.rating > 0 ? selectedPlace.rating.toFixed(1) : "-"}
              <span className="text-muted-foreground/70">({selectedPlace.user_ratings_total})</span>
            </span>
            {selectedPlace.distance_miles !== undefined ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {selectedPlace.distance_miles.toFixed(1)} mi
              </span>
            ) : null}
          </div>
        </a>
      ) : (
        <div className="rounded-[1rem] border border-white/10 bg-background/35 p-4 text-sm text-muted-foreground">
          暂时没有可选的店。
        </div>
      )}
    </section>
  );
}

export default function BlindBoxCategoryGrid({
  placesByCategory,
  titleMap = {
    中餐: "正餐",
    奶茶: "喝的",
    夜宵: "夜宵",
  },
}: BlindBoxCategoryGridProps) {
  const categories = ["中餐", "奶茶", "夜宵"];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {categories.map((category) => (
        <BlindCard
          key={category}
          title={titleMap[category] || category}
          places={placesByCategory[category] || []}
        />
      ))}
    </div>
  );
}
