import { useEffect, useMemo, useState } from "react";
import TimeAgo from "@/components/TimeAgo";
import { config } from "@/config";

interface FanwanVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
  durationSec?: number | null;
}

function formatDuration(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = (minutes % 60).toString().padStart(2, "0");
    return `${hours}:${restMinutes}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export default function FanwanFull() {
  const [videos, setVideos] = useState<FanwanVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtube/fanwan`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();
          setVideos(result.videos || []);
        }
      } catch (error) {
        console.error("[FanwanFull] Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, []);

  const sortedChannels = useMemo(() => {
    const channelGroups = videos.reduce(
      (acc, video) => {
        const channel = video.channelTitle || "Unknown Channel";
        if (!acc[channel]) acc[channel] = [];
        acc[channel].push(video);
        return acc;
      },
      {} as Record<string, FanwanVideo[]>,
    );

    return Object.entries(channelGroups).sort(([, a], [, b]) => b.length - a.length);
  }, [videos]);

  if (loading) {
    return (
      <div className="section-shell rounded-sm p-5">
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
    <section className="section-shell rounded-sm">
      <div className="border-b border-border/30 p-5">
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.9fr] md:items-end">
          <div>
            <div className="eyebrow mb-2">Career Watch</div>
            <h2 className="text-xl font-semibold text-foreground">关于饭碗</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground/72">
              把职业和跳槽话题按频道聚合，方便快速分辨哪些内容值得花时间看完。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">
                Window
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">14d</div>
              <div className="mt-1 text-xs text-muted-foreground">最近两周职业内容窗口</div>
            </div>
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                Videos
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{videos.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">按频道整理，不做无序瀑布流</div>
            </div>
            <div className="hero-pulse-card rounded-sm p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">
                Channels
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{sortedChannels.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">先看谁在密集更新，再决定是否点开</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        {videos.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">暂无更新</div>
        ) : (
          <div className="space-y-6">
            {sortedChannels.map(([channelName, channelVideos]) => (
              <section
                key={channelName}
                className="rounded-sm border border-border/35 bg-card/45 p-4"
              >
                <div className="mb-4 flex flex-col gap-2 border-b border-border/25 pb-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground/92">{channelName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      频道内共 {channelVideos.length} 条饭碗相关内容，优先看最近更新最密集的来源。
                    </div>
                  </div>
                  <span className="signal-chip w-fit">
                    <span className="signal-dot bg-amber-300" />
                    {channelVideos.length} videos
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {channelVideos.map((video) => (
                    <a
                      key={video.videoId}
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
                        {video.durationSec ? (
                          <div className="absolute bottom-2 right-2 rounded-sm bg-black/80 px-2 py-1 text-[10px] font-mono text-white">
                            {formatDuration(video.durationSec)}
                          </div>
                        ) : null}
                      </div>

                      <div className="p-3">
                        <h3 className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                          {video.title}
                        </h3>
                        <div className="mt-3 text-[11px] font-mono text-muted-foreground/72">
                          <TimeAgo isoString={video.publishedAt} />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
