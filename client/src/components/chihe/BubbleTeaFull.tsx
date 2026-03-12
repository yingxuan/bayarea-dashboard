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

interface BubbleTeaFullProps {
  places: SpendPlace[];
  loading?: boolean;
}

function BubbleTeaSkeleton() {
  return (
    <div className="section-shell section-shell-food rounded-[1.2rem] p-5">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-80 rounded-[1.15rem]" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BubbleTeaFull({ places, loading = false }: BubbleTeaFullProps) {
  if (loading) return <BubbleTeaSkeleton />;

  if (places.length === 0) {
    return (
      <div className="section-shell section-shell-food rounded-[1.2rem] p-8 text-center">
        <div className="text-sm text-muted-foreground">暂时没有奶茶推荐</div>
        <div className="mt-2 text-xs text-muted-foreground/72">稍后再来，或者先切到别的分类看看。</div>
      </div>
    );
  }

  return (
    <section className="section-shell section-shell-food rounded-[1.2rem]">
      <div className="border-b border-white/10 p-5">
        <div className="grid gap-4 md:grid-cols-[1.15fr_0.95fr] md:items-end">
          <div>
            <div className="section-kicker mb-2">
              <div className="eyebrow">Bubble Tea</div>
              <span className="briefing-badge">Easy pick</span>
            </div>
            <h2 className="text-xl font-semibold text-amber-300/90">奶茶</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground/78">
              适合通勤路上、午后补糖、顺手带一杯。重点不是研究菜单，而是快速挑一家靠谱的。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="hero-pulse-card rounded-[1rem] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">Count</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{places.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">当前可选奶茶店</div>
            </div>
            <div className="hero-pulse-card rounded-[1rem] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">Use Case</div>
              <div className="mt-2 text-sm leading-6 text-foreground/88">轻决策，适合就近满足。</div>
            </div>
            <div className="hero-pulse-card rounded-[1rem] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">Bias</div>
              <div className="mt-2 text-sm leading-6 text-foreground/88">优先近、稳、评分扎实。</div>
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
