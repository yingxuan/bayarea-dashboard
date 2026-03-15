import { useEffect, useMemo, useState } from "react";
import TimeAgo from "@/components/TimeAgo";
import VideoThumbnail from "@/components/VideoThumbnail";
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

function formatDuration(sec: number) {
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

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        setVideos((result.videos || []).slice(0, 8));
      } catch (error) {
        console.error("[FanwanFull] Failed to fetch videos:", error);
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
      <section className="section-shell rounded-sm p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 rounded bg-muted" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell rounded-sm p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">饭碗频道</h2>
        <span className="text-[11px] font-mono text-muted-foreground/70">{sortedVideos.length} 条</span>
      </div>

      {sortedVideos.length === 0 ? (
        <div className="rounded-sm border border-border/35 bg-card/35 px-4 py-8 text-center text-sm text-muted-foreground">
          暂无更新
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sortedVideos.map((video) => (
            <a
              key={video.videoId}
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-sm border border-border/35 bg-card/40 transition-colors hover:border-primary/45 hover:bg-card/65"
            >
              <div className="aspect-video overflow-hidden bg-muted">
                <VideoThumbnail
                  src={video.thumbnail}
                  videoUrl={video.url}
                  videoId={video.videoId}
                  alt={video.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-3">
                <div className="text-[11px] font-mono text-muted-foreground/70">{video.channelTitle}</div>
                <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                  {video.title}
                </h3>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground/70">
                  <TimeAgo isoString={video.publishedAt} />
                  {video.durationSec ? <span>{formatDuration(video.durationSec)}</span> : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
