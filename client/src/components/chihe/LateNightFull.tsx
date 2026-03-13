import PlaceCard from "./PlaceCard";
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

interface LateNightFullProps {
  places: SpendPlace[];
  loading?: boolean;
}

function LateNightSkeleton() {
  return (
    <div className="section-shell section-shell-food rounded-[1.2rem] p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-80 rounded-[1.15rem]" />
        ))}
      </div>
    </div>
  );
}

export default function LateNightFull({ places, loading = false }: LateNightFullProps) {
  if (loading) return <LateNightSkeleton />;

  if (places.length === 0) {
    return (
      <div className="section-shell section-shell-food rounded-[1.2rem] p-8 text-center">
        <div className="text-sm text-muted-foreground">
          {"\u6682\u65f6\u6ca1\u6709\u591c\u5bb5\u63a8\u8350"}
        </div>
      </div>
    );
  }

  return (
    <section className="section-shell section-shell-food rounded-[1.2rem] p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {places.map((place) => (
          <PlaceCard key={place.id} place={place} size="medium" />
        ))}
      </div>
    </section>
  );
}
