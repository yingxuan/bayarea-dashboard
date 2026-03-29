import { useMemo, useState } from "react";
import { MapPin, Shuffle, Star } from "lucide-react";

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

interface HomeBlindBoxCardProps {
  places: SpendPlace[];
}

function pickRandomIndex(length: number, exclude?: number) {
  if (length <= 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (exclude === undefined) return next;
  while (next === exclude) next = Math.floor(Math.random() * length);
  return next;
}

export default function HomeBlindBoxCard({ places }: HomeBlindBoxCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedPlace = useMemo(() => {
    if (places.length === 0) return null;
    return places[Math.min(selectedIndex, places.length - 1)];
  }, [places, selectedIndex]);

  return (
    <section className="rounded-[1.2rem] border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Blind Box</div>
          <h3 className="entry-card-title">今晚别纠结吃什么</h3>
        </div>
        <button
          type="button"
          onClick={() => setSelectedIndex((current) => pickRandomIndex(places.length, current))}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 text-[13px] font-medium text-foreground/78 transition-colors hover:border-white/24 hover:text-foreground"
        >
          <Shuffle className="h-3.5 w-3.5" />
          换一家
        </button>
      </div>

      {selectedPlace ? (
        <a
          href={selectedPlace.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-[1rem] border border-white/10 bg-background/35 p-4 transition-all hover:border-primary/35 hover:bg-background/55"
        >
          <div className="entry-card-label mb-2 inline-flex rounded-full border border-white/10 bg-white/6 px-2 py-1 text-muted-foreground/80">
            {selectedPlace.category}
          </div>
          <div className="entry-card-title">{selectedPlace.name}</div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {selectedPlace.rating > 0 ? selectedPlace.rating.toFixed(1) : "-"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {selectedPlace.city}
            </span>
            {selectedPlace.distance_miles !== undefined ? (
              <span>{selectedPlace.distance_miles.toFixed(1)} mi</span>
            ) : null}
          </div>
        </a>
      ) : (
        <div className="mt-4 rounded-[1rem] border border-white/10 bg-background/35 p-4 text-sm text-muted-foreground">
          暂无可抽的店。
        </div>
      )}
    </section>
  );
}
