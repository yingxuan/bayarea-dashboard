import { useEffect, useMemo, useState } from "react";
import TimeAgo from "@/components/TimeAgo";
import VideoThumbnail from "@/components/VideoThumbnail";
import { config } from "@/config";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

interface YouTuberVideo {
  channelName: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
  status: string;
  views?: number;
  duration?: string;
}

function formatViews(views?: number) {
  if (views === undefined) return null;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return `${views}`;
}

export default function StockYouTubersFull() {
  const [videos, setVideos] = useState<YouTuberVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtubers?category=stock`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        const items = (result.items || result.youtubers || []) as YouTuberVideo[];
        setVideos(items.filter((item) => item.status === "ok"));
      } catch (error) {
        console.error("[StockYouTubersFull] Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, []);

  const sortedVideos = useMemo(
    () =>
      [...videos].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      ),
    [videos],
  );

  if (loading) {
    return (
      <section className="section-shell section-shell-market rounded-sm p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded bg-muted" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell section-shell-market rounded-sm p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-cyan-300/90">美股博主</h2>
        <span className="text-[11px] font-mono text-muted-foreground/70">{sortedVideos.length} 条</span>
      </div>

      {sortedVideos.length === 0 ? (
        <div className="rounded-sm border border-border/35 bg-card/35 px-4 py-8 text-center text-sm text-muted-foreground">
          暂无更新
        </div>
      ) : (
        <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full">
          <CarouselContent className="-ml-3">
            {sortedVideos.slice(0, 10).map((video, index) => {
              const viewsLabel = formatViews(video.views);

              return (
                <CarouselItem
                  key={`${video.channelName}-${index}-${video.url}`}
                  className="min-w-0 shrink-0 pl-3 md:basis-1/2 xl:basis-1/3"
                >
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-sm border border-border/35 bg-card/40 transition-colors hover:border-primary/45 hover:bg-card/65"
                  >
                    <div className="aspect-video overflow-hidden bg-muted">
                      <VideoThumbnail
                        src={video.thumbnail}
                        videoUrl={video.url}
                        alt={video.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="p-3">
                      <div className="text-[11px] font-mono text-muted-foreground/70">
                        {video.channelName}
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                        {video.title}
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground/70">
                        <TimeAgo isoString={video.publishedAt} />
                        {viewsLabel ? <span>{viewsLabel} views</span> : null}
                        {video.duration ? <span>{video.duration}</span> : null}
                      </div>
                    </div>
                  </a>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      )}
    </section>
  );
}
