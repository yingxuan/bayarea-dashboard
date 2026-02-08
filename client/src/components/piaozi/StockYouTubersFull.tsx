/**
 * Stock YouTubers Full Component (Extended Video View)
 * Displays all stock YouTuber videos with:
 * - Grouped by channel
 * - More video history per channel
 * - Grid layout for better viewing
 */

import { useEffect, useState, useMemo } from "react";
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

export default function StockYouTubersFull() {
  const [videos, setVideos] = useState<YouTuberVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all stock youtuber videos
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtubers?category=stock`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();
          const items = result.items || result.youtubers || [];
          // Filter only OK status videos
          const okVideos = items.filter((item: YouTuberVideo) => item.status === 'ok');
          setVideos(okVideos);
        }
      } catch (error) {
        console.error("[StockYouTubersFull] Failed to fetch videos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, []);

  // Group videos by channel
  const channelGroups: ChannelGroup[] = useMemo(() => {
    const channelMap = new Map<string, YouTuberVideo[]>();

    videos.forEach((video) => {
      const channelName = video.channelName || 'Unknown Channel';
      if (!channelMap.has(channelName)) {
        channelMap.set(channelName, []);
      }
      channelMap.get(channelName)!.push(video);
    });

    // Sort each channel's videos by date (newest first)
    channelMap.forEach((channelVideos) => {
      channelVideos.sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    });

    // Convert to array and sort channels by latest video date
    const groups = Array.from(channelMap.entries()).map(([channelName, channelVideos]) => ({
      channelName,
      videos: channelVideos.slice(0, 6), // Show up to 6 videos per channel
    }));

    groups.sort((a, b) => {
      const aLatest = a.videos[0]?.publishedAt || '';
      const bLatest = b.videos[0]?.publishedAt || '';
      return new Date(bLatest).getTime() - new Date(aLatest).getTime();
    });

    return groups;
  }, [videos]);

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
        <h2 className="text-lg font-mono font-medium text-foreground">美股博主</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {channelGroups.length} 个频道 · {videos.length} 个视频
        </p>
      </div>

      {/* Channel Groups */}
      <div className="p-4 space-y-8">
        {channelGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-mono">
            暂无更新
          </div>
        ) : (
          channelGroups.map((group) => (
            <div key={group.channelName} className="space-y-3">
              {/* Channel Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono font-medium text-foreground/80">
                  {group.channelName}
                </h3>
                <span className="text-xs font-mono text-muted-foreground">
                  {group.videos.length} 个视频
                </span>
              </div>

              {/* Videos Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.videos.map((video, index) => (
                  <a
                    key={`${video.channelName}-${index}`}
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
                      {video.duration && (
                        <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 rounded text-[10px] font-mono text-white">
                          {video.duration}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <h4 className="text-[12px] font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                        {video.title}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground font-mono">
                        <TimeAgo isoString={video.publishedAt} />
                        {video.views !== undefined && (
                          <>
                            <span>·</span>
                            <span>{(video.views / 1000).toFixed(1)}K views</span>
                          </>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
