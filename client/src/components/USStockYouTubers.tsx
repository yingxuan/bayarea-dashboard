import { useMemo } from "react";
import { RefreshCcw } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import TimeAgo from "@/components/TimeAgo";

interface USStockYouTubersProps {
  stockYoutubers: any[];
  offset?: number;
  onRefresh?: () => void;
}

export default function USStockYouTubers({
  stockYoutubers,
  offset = 0,
  onRefresh,
}: USStockYouTubersProps) {
  const availableVideos = stockYoutubers.filter((item) => item.status === "ok");
  const batchSize = 4;

  const displayVideos = useMemo(() => {
    if (availableVideos.length === 0) return [];
    const start = offset % availableVideos.length;
    return [...availableVideos.slice(start), ...availableVideos.slice(0, start)].slice(0, batchSize);
  }, [availableVideos, offset]);

  const latestVideoTime = useMemo(() => {
    const times = displayVideos
      .map((video) => video.publishedAt)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => !isNaN(value));
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }, [displayVideos]);

  const statusHint = useMemo(() => {
    if (!latestVideoTime) return null;
    const diffMinutes = Math.floor((Date.now() - latestVideoTime.getTime()) / (1000 * 60));
    if (diffMinutes < 60) return `更新于 ${diffMinutes} 分钟前`;
    if (diffMinutes < 1440) return `更新于 ${Math.floor(diffMinutes / 60)} 小时前`;
    return "最近一轮频道更新";
  }, [latestVideoTime]);

  if (availableVideos.length === 0) return null;

  return (
    <div className="rounded-sm border border-border/35 bg-card/45 p-4">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-border/25 pb-3">
        <div>
          <div className="eyebrow mb-2">Market Voices</div>
          <h3 className="text-[15px] font-semibold text-foreground/92">美股博主</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusHint || "用频道更新速度判断今天哪些声音值得扫一眼。"}
          </p>
        </div>
        {onRefresh ? (
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
          {displayVideos.map((item, index) => (
            <CarouselItem
              key={`${item.channelName}-${offset + index}`}
              className="min-w-0 shrink-0 pl-3 md:basis-1/2"
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-sm border border-border/35 bg-background/55 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/75 hover:shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute left-3 top-3 rounded-sm border border-white/15 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/78">
                    {item.channelName}
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                    {item.title}
                  </h4>
                  <div className="mt-3 text-[11px] font-mono text-muted-foreground/72">
                    <TimeAgo isoString={item.publishedAt} />
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
