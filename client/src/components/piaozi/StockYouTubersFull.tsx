import { useEffect, useMemo, useState } from "react";
import TimeAgo from "@/components/TimeAgo";
import { config } from "@/config";

interface YouTuberVideo {
  channelName: string;
  channelId?: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
  status: string;
  views?: number;
  duration?: string;
}

interface ChannelGroup {
  channelName: string;
  videos: YouTuberVideo[];
}

function formatViews(views?: number): string | null {
  if (views === undefined) return null;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
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

        if (response.ok) {
          const result = await response.json();
          const items = result.items || result.youtubers || [];
          setVideos(items.filter((item: YouTuberVideo) => item.status === "ok"));
        }
      } catch (error) {
        console.error("[StockYouTubersFull] Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, []);

  const channelGroups: ChannelGroup[] = useMemo(() => {
    const channelMap = new Map<string, YouTuberVideo[]>();

    videos.forEach((video) => {
      const channelName = video.channelName || "Unknown Channel";
      if (!channelMap.has(channelName)) {
        channelMap.set(channelName, []);
      }
      channelMap.get(channelName)?.push(video);
    });

    channelMap.forEach((channelVideos) => {
      channelVideos.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
    });

    return Array.from(channelMap.entries())
      .map(([channelName, channelVideos]) => ({
        channelName,
        videos: channelVideos.slice(0, 6),
      }))
      .sort((a, b) => {
        const aLatest = a.videos[0]?.publishedAt || "";
        const bLatest = b.videos[0]?.publishedAt || "";
        return new Date(bLatest).getTime() - new Date(aLatest).getTime();
      });
  }, [videos]);

  if (loading) {
    return (
      <div className="section-shell section-shell-market rounded-sm p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="section-shell section-shell-market rounded-sm">
      <div className="border-b border-border/30 p-5">
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.9fr] md:items-end">
          <div>
            <div className="eyebrow mb-2">Market Voices</div>
            <h2 className="text-xl font-semibold text-cyan-300/90">美股博主</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground/72">
              不把视频流当噪音列表看，而是按频道整理成可快速扫读的市场观点面板。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/75">
                Channels
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{channelGroups.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">按最近更新时间排序</div>
            </div>
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                Videos
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{videos.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">仅展示状态正常的视频</div>
            </div>
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">
                Focus
              </div>
              <div className="mt-2 text-sm leading-6 text-foreground/88">先看最近更新的频道，再决定要不要深看。</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        {channelGroups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">暂无更新</div>
        ) : (
          <div className="space-y-6">
            {channelGroups.map((group) => (
              <section
                key={group.channelName}
                className="rounded-sm border border-border/35 bg-card/45 p-4"
              >
                <div className="mb-4 flex flex-col gap-2 border-b border-border/25 pb-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground/92">{group.channelName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      最近 {group.videos.length} 条内容，适合快速判断这个频道今天在讲什么。
                    </div>
                  </div>
                  <span className="signal-chip w-fit">
                    <span className="signal-dot bg-cyan-300" />
                    {group.videos.length} videos
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.videos.map((video, index) => {
                    const viewsLabel = formatViews(video.views);

                    return (
                      <a
                        key={`${video.channelName}-${index}-${video.url}`}
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group overflow-hidden rounded-sm border border-border/35 bg-background/55 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/75 hover:shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
                      >
                        <div className="relative aspect-video overflow-hidden bg-muted">
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          {video.duration ? (
                            <div className="absolute bottom-2 right-2 rounded-sm bg-black/80 px-2 py-1 text-[10px] font-mono text-white">
                              {video.duration}
                            </div>
                          ) : null}
                        </div>

                        <div className="p-3">
                          <h3 className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                            {video.title}
                          </h3>
                          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-muted-foreground/72">
                            <TimeAgo isoString={video.publishedAt} />
                            {viewsLabel ? <span>{viewsLabel}</span> : null}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
