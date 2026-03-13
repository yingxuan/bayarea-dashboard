import { useEffect, useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import PlaceCard from "./PlaceCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

interface BlindBoxFullProps {
  places: SpendPlace[];
  loading?: boolean;
}

function BlindBoxSkeleton() {
  return (
    <div className="section-shell section-shell-food rounded-[1.2rem] p-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-48 rounded-full" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="h-[28rem] rounded-[1.15rem]" />
      </div>
    </div>
  );
}

function pickRandomIndex(length: number, exclude?: number) {
  if (length <= 1) return 0;
  let next = Math.floor(Math.random() * length);
  if (exclude === undefined) return next;
  while (next === exclude) {
    next = Math.floor(Math.random() * length);
  }
  return next;
}

export default function BlindBoxFull({ places, loading = false }: BlindBoxFullProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(places.length > 0 ? pickRandomIndex(places.length) : 0);
  }, [places]);

  const selectedPlace = useMemo(() => {
    if (places.length === 0) return null;
    return places[Math.min(selectedIndex, places.length - 1)];
  }, [places, selectedIndex]);

  if (loading) return <BlindBoxSkeleton />;

  if (places.length === 0) {
    return (
      <div className="section-shell section-shell-food rounded-[1.2rem] p-8 text-center">
        <div className="text-sm text-muted-foreground">
          {"\u6682\u65f6\u6ca1\u6709\u53ef\u4ee5\u62bd\u7684\u5e97\u3002"}
        </div>
      </div>
    );
  }

  return (
    <section className="section-shell section-shell-food rounded-[1.2rem] p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {"\u4eca\u5929\u5403\u8fd9\u5bb6"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {"\u4e0d\u518d\u72b9\u8c6b\uff0c\u4ece\u5f53\u524d\u6e05\u5355\u91cc\u76f4\u63a5\u62bd\u4e00\u5bb6\u3002"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-3 text-xs"
          onClick={() => setSelectedIndex((current) => pickRandomIndex(places.length, current))}
        >
          <Shuffle className="mr-1.5 h-3.5 w-3.5" />
          {"\u6362\u4e00\u5bb6"}
        </Button>
      </div>

      {selectedPlace ? <PlaceCard place={selectedPlace} size="large" showCategory /> : null}
    </section>
  );
}
