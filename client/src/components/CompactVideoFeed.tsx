import { useEffect, useMemo, useState } from "react";
import TimeAgo from "@/components/TimeAgo";
import VideoThumbnail from "@/components/VideoThumbnail";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

type FeedKind = "stock" | "career";

interface StockVideo {
  channelName: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
  status: string;
}

interface CareerVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
}

interface CompactVideoFeedProps {
  kind: FeedKind;
  maxItems?: number;
  title?: string;
  subtitle?: string;
  layout?: "stack" | "carousel";
  moreHref?: string;
  moreLabel?: string;
  hideHeader?: boolean;
  carouselItemClassName?: string;
}

interface VideoCard {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
}

export default function CompactVideoFeed({
  kind,
  maxItems = 2,
  title,
  subtitle,
  layout = "stack",
  moreHref,
  moreLabel = "更多",
  hideHeader = false,
  carouselItemClassName = "min-w-0 shrink-0 pl-3 md:basis-1/2",
}: CompactVideoFeedProps) {
  const [items, setItems] = useState<VideoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();

  useEffect(() => {
    async function load() {
      try {
        const endpoint =
          kind === "stock"
            ? `${config.apiBaseUrl}/api/youtubers?category=stock`
            : `${config.apiBaseUrl}/api/youtube/fanwan`;

        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const result = await response.json();
        const nextItems =
          kind === "stock"
            ? ((result.items || result.youtubers || []) as StockVideo[])
                .filter((item) => item.status === "ok")
                .map((item, index) => ({
                  id: `${item.channelName}-${index}-${item.url}`,
                  title: item.title,
                  url: item.url,
                  thumbnail: item.thumbnail,
                  channel: item.channelName,
                  publishedAt: item.publishedAt,
                }))
            : ((result.videos || []) as CareerVideo[]).map((item) => ({
                id: item.videoId,
                title: item.title,
                url: item.url,
                thumbnail: item.thumbnail,
                channel: item.channelTitle,
                publishedAt: item.publishedAt,
              }));

        setItems(nextItems);
      } catch (error) {
        console.error("[CompactVideoFeed] Failed to fetch videos:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [kind]);

  const visibleItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, maxItems),
    [items, maxItems],
  );

  const resolvedTitle = title || (kind === "stock" ? "最新美股视频" : "找工视频");
  const resolvedSubtitle = subtitle || "";

  if (loading) {
    return (
      <div className="editorial-card min-w-0 rounded-[1.15rem] p-4">
        {!hideHeader ? (
          <div className="mb-3 text-sm font-semibold text-foreground/92">{resolvedTitle}</div>
        ) : null}
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-[0.95rem] bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="editorial-card min-w-0 overflow-hidden rounded-[1.15rem] p-4">
      {!hideHeader ? (
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/20 pb-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground/92">{resolvedTitle}</div>
            {resolvedSubtitle ? (
              <div className="mt-1 text-xs text-muted-foreground">{resolvedSubtitle}</div>
            ) : null}
          </div>
          {moreHref ? (
            <a
              href={moreHref}
              className="shrink-0 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              {moreLabel}
            </a>
          ) : null}
        </div>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="rounded-[0.95rem] border border-border/25 bg-background/35 px-3 py-4 text-sm text-muted-foreground">
          暂无可用视频。
        </div>
      ) : layout === "carousel" ? (
        <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full min-w-0">
          <CarouselContent className="-ml-3">
            {visibleItems.map((item) => (
              <CarouselItem key={item.id} className={carouselItemClassName}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleExternalLinkClick}
                  className="group block h-full overflow-hidden rounded-[0.95rem] border border-border/25 bg-background/35 transition-all hover:border-primary/35 hover:bg-background/55"
                >
                  <div className="aspect-video max-h-[11rem] overflow-hidden bg-muted sm:max-h-none">
                    <VideoThumbnail
                      src={item.thumbnail}
                      videoUrl={item.url}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-mono text-muted-foreground/70">{item.channel}</div>
                    <div className="mt-1 line-clamp-2 break-words text-[13px] leading-6 text-foreground/90 transition-colors group-hover:text-primary">
                      {item.title}
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-muted-foreground/65">
                      <TimeAgo isoString={item.publishedAt} />
                    </div>
                  </div>
                </a>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      ) : (
        <div className="grid h-full gap-3 md:grid-rows-2">
          {visibleItems.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group flex h-full flex-col overflow-hidden rounded-[0.95rem] border border-border/25 bg-background/35 transition-all hover:border-primary/35 hover:bg-background/55"
            >
              <div className="h-28 overflow-hidden bg-muted sm:h-32 md:h-36">
                <VideoThumbnail
                  src={item.thumbnail}
                  videoUrl={item.url}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="text-[11px] font-mono text-muted-foreground/70">{item.channel}</div>
                <div className="mt-1 line-clamp-2 break-words text-[13px] leading-6 text-foreground/90 transition-colors group-hover:text-primary">
                  {item.title}
                </div>
                <div className="mt-auto pt-2 text-[11px] font-mono text-muted-foreground/65">
                  <TimeAgo isoString={item.publishedAt} />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
