import BlindBoxCategoryGrid from "@/components/BlindBoxCategoryGrid";
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
    <div className="grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map((index) => (
        <div key={index} className="section-shell section-shell-food rounded-[1.2rem] p-5">
          <div className="space-y-3">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-32 w-full rounded-[1rem]" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BlindBoxFull({ places, loading = false }: BlindBoxFullProps) {
  if (loading) return <BlindBoxSkeleton />;

  const grouped = {
    中餐: places.filter((place) => place.category === "中餐"),
    奶茶: places.filter((place) => place.category === "奶茶"),
    夜宵: places.filter((place) => place.category === "夜宵"),
  };

  return (
    <section className="section-shell section-shell-food rounded-[1.2rem] p-5">
      <BlindBoxCategoryGrid placesByCategory={grouped} />
    </section>
  );
}
