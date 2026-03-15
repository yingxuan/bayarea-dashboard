import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Shuffle, Star } from "lucide-react";

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
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
          className="group block rounded-[1rem] border border-white/10 bg-background/35 p-4 transition-all hover:border-primary/35 hover:bg-background/55"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="line-clamp-2 text-base font-semibold text-foreground">
                {selectedPlace.name}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{selectedPlace.city}</div>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-foreground/70 transition-colors group-hover:border-primary/30 group-hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
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
