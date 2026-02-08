/**
 * Fanwan Full Component (Complete Career Videos View)
 * Displays all career-related videos from the past 14 days with:
 * - Full video list (no limit)
 * - Grid layout for better viewing
 * - Video duration display
 */

import { useEffect, useState } from "react";
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
    const restM = (minutes % 60).toString().padStart(2, "0");
    return `${hours}:${restM}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export default function FanwanFull() {
  const [videos, setVideos] = useState<FanwanVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch fanwan videos
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtube/fanwan`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();
          const videoItems = result.videos || [];
          setVideos(videoItems); // All videos, no limit
        }
      } catch (error) {
        console.error("[FanwanFull] Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, []);

  // Group videos by channel
  const channelGroups = videos.reduce((acc, video) => {
    const channel = video.channelTitle || 'Unknown Channel';
    if (!acc[channel]) {
      acc[channel] = [];
    }
    acc[channel].push(video);
    return acc;
  }, {} as Record<string, FanwanVideo[]>);

  // Sort channels by number of videos (most first)
  const sortedChannels = Object.entries(channelGroups)
    .sort(([, a], [, b]) => b.length - a.length);

  if (loading) {
    return (
      <div className="bg-card rounded-sm shadow-md border border-border/40 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-video bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-sm shadow-md border border-border/40">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <h2 className="text-lg font-mono font-medium text-foreground">关于饭碗</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          最近 14 天 · {videos.length} 个视频 · {sortedChannels.length} 个频道
        </p>
      </div>

      {/* Videos */}
      <div className="p-4">
        {videos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-mono">
            暂无更新
          </div>
        ) : (
          <div className="space-y-8">
            {sortedChannels.map(([channelName, channelVideos]) => (
              <div key={channelName} className="space-y-3">
                {/* Channel Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono font-medium text-foreground/80">
                    {channelName}
                  </h3>
                  <span className="text-xs font-mono text-muted-foreground">
                    {channelVideos.length} 个视频
                  </span>
                </div>

                {/* Videos Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {channelVideos.map((video) => (
                    <a
                      key={video.videoId}
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden bg-card/50 border border-border/30 hover:border-primary/50 transition-all group"
                    >
                      <div className="relative aspect-video bg-muted overflow-hidden">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        {video.durationSec && (
                          <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 rounded text-[10px] font-mono text-white">
                            {formatDuration(video.durationSec)}
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <h4 className="text-[12px] font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {video.title}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground font-mono">
                          <TimeAgo isoString={video.publishedAt} />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
