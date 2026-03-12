import { RefreshCcw } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

interface ShowsCarouselProps {
  shows: any[];
  offset?: number;
  onRefresh?: () => void;
}

export default function ShowsCarousel({ shows, offset = 0, onRefresh }: ShowsCarouselProps) {
  if (shows.length === 0) return null;

  const allDisplayShows = shows.map((show: any) => ({
    id: String(show.id || show.videoId || Date.now()),
    title: show.title || show.name || "",
    poster: show.poster_url || show.poster || show.thumbnail || "",
    rating: show.rating || show.vote_average || 0,
    platform: show.platform || "YouTube",
    url: show.url || `https://www.youtube.com/watch?v=${show.id}`,
  }));

  const showsByPlatform: Record<string, typeof allDisplayShows> = {};
  allDisplayShows.forEach((show) => {
    const platform = show.platform || "其他";
    if (!showsByPlatform[platform]) showsByPlatform[platform] = [];
    showsByPlatform[platform].push(show);
  });

  const platformOrder = ["腾讯视频", "优酷", "iQIYI"];
  const orderedPlatforms = [
    ...platformOrder.filter((platform) => showsByPlatform[platform]?.length > 0),
    ...Object.keys(showsByPlatform).filter((platform) => !platformOrder.includes(platform)),
  ];

  const displayShows: typeof allDisplayShows = [];
  const showsPerPlatform = 2;
  const maxPlatforms = 4;

  for (let i = 0; i < Math.min(orderedPlatforms.length, maxPlatforms); i++) {
    const platform = orderedPlatforms[i];
    const platformShows = showsByPlatform[platform] || [];
    const startIdx = (offset * showsPerPlatform) % Math.max(platformShows.length, 1);
    for (let j = 0; j < showsPerPlatform && j < platformShows.length; j++) {
      displayShows.push(platformShows[(startIdx + j) % platformShows.length]);
    }
  }

  const hasMore =
    orderedPlatforms.length > maxPlatforms ||
    Object.values(showsByPlatform).some((items) => items.length > showsPerPlatform);

  return (
    <div className="rounded-sm border border-border/35 bg-card/45 p-4">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-border/25 pb-3">
        <div>
          <div className="eyebrow mb-2">Shows</div>
          <h3 className="text-[15px] font-semibold text-foreground/92">追剧</h3>
          <p className="mt-1 text-xs text-muted-foreground">下班后的低成本娱乐提案，优先给你可直接点开的平台内容。</p>
        </div>
        {onRefresh && hasMore ? (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-sm border border-border/35 bg-background/55 px-3 py-2 text-xs text-foreground/78 transition-all hover:border-primary/45 hover:text-primary"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            换一批
          </button>
        ) : null}
      </div>

      <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full">
        <CarouselContent className="-ml-3">
          {displayShows.map((show) => (
            <CarouselItem key={show.id} className="min-w-0 shrink-0 pl-3 md:basis-1/4">
              <a
                href={show.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-sm border border-border/35 bg-background/55 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/75"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={show.poster}
                    alt={show.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute left-3 top-3 rounded-sm border border-white/15 bg-black/35 px-2 py-1 text-[10px] text-white/78">
                    {show.platform}
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                    {show.title}
                  </h4>
                  <div className="mt-2 text-[11px] font-mono text-muted-foreground/72">
                    {show.rating > 0 ? `★ ${show.rating.toFixed(1)}` : "New pick"}
                  </div>
                </div>
              </a>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
