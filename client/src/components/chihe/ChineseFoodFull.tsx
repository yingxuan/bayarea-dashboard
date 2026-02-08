/**
 * ChineseFoodFull Component
 * Complete list of Chinese restaurants for the Chihe page
 *
 * Features:
 * - Grid layout with responsive columns
 * - All available Chinese restaurants
 * - Sorted by rating/popularity
 */

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

interface ChineseFoodFullProps {
  places: SpendPlace[];
  loading?: boolean;
}

export default function ChineseFoodFull({ places, loading = false }: ChineseFoodFullProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden bg-card/50 border border-border/40">
            <Skeleton className="w-full h-40" />
          </div>
        ))}
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="rounded-lg bg-card/50 border border-border/40 p-8 text-center">
        <p className="text-muted-foreground font-mono">暂无中餐馆推荐</p>
        <p className="text-sm text-muted-foreground/70 mt-2">请稍后再来查看</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category description */}
      <div className="text-sm text-muted-foreground/80 font-mono">
        湾区中餐馆推荐 - 共 {places.length} 家
      </div>

      {/* Grid layout */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {places.map((place) => (
          <PlaceCard key={place.id} place={place} size="medium" />
        ))}
      </div>
    </div>
  );
}
