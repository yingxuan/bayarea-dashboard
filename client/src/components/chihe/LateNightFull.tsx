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

export default function LateNightFull({ places, loading = false }: LateNightFullProps) {
  if (loading) {
    return (
      <div className="section-shell section-shell-food rounded-sm p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="section-shell section-shell-food rounded-sm p-8 text-center">
        <div className="text-sm text-muted-foreground">暂无夜宵推荐</div>
        <div className="mt-2 text-xs text-muted-foreground/72">稍后再来，或者切到别的类别看看。</div>
      </div>
    );
  }

  return (
    <section className="section-shell section-shell-food rounded-sm">
      <div className="border-b border-border/30 p-5">
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.9fr] md:items-end">
          <div>
            <div className="eyebrow mb-2">Late Night</div>
            <h2 className="text-xl font-semibold text-amber-300/90">夜宵</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground/72">
              这是情绪和时间都更紧的决策。优先看还值不值得出门，以及吃完回家的代价。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">Count</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{places.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">当前可选夜宵店</div>
            </div>
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">Use Case</div>
              <div className="mt-2 text-sm leading-6 text-foreground/88">下班后、聚会后、加班后。</div>
            </div>
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">Bias</div>
              <div className="mt-2 text-sm leading-6 text-foreground/88">优先热食、近、适合快速落地。</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {places.map((place) => (
            <PlaceCard key={place.id} place={place} size="medium" />
          ))}
        </div>
      </div>
    </section>
  );
}
