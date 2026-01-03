/**
 * Community & Video Carousel Component
 * Desktop: 一亩三分地在左列，美股博主全宽carousel在下方
 * Mobile: 纵向堆叠
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import LeekCommunity from "@/components/LeekCommunity";
import { ExternalLink } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";

interface CommunityVideoCarouselProps {
  stockYoutubers: any[];
  offset?: number; // Current display offset (for "换一批" functionality)
  onRefresh?: () => void; // Callback for "换一批" button
}

export default function CommunityVideoCarousel({ stockYoutubers, offset = 0, onRefresh }: CommunityVideoCarouselProps) {
  // Filter and prepare videos
  const availableVideos = stockYoutubers.filter(item => item.status === 'ok');
  // Display 2 videos at a time (for "换一批" functionality)
  const VIDEOS_PER_BATCH = 2;
  const displayVideos = availableVideos.slice(offset, offset + VIDEOS_PER_BATCH);
  const hasMore = availableVideos.length > VIDEOS_PER_BATCH;

  return (
    <div className="w-full">
      {/* Desktop: 一亩三分地和美股博主同一行两列 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: 一亩三分地讨论 */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold font-mono text-foreground/90">一亩三分地</h3>
            <a
              href="https://www.1point3acres.com/bbs/forum.php?mod=forumdisplay&fid=291"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs opacity-70 hover:opacity-100 transition-opacity font-mono"
            >
              查看更多
            </a>
          </div>
          <div className="min-h-0">
            <LeekCommunity maxItems={3} hideTitle={true} />
          </div>
        </div>

        {/* Right: 美股博主（2个视频卡片并排 + 查看更多按钮） */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold font-mono text-foreground/90">美股博主</h3>
            {onRefresh && hasMore && (
              <button
                onClick={onRefresh}
                className="text-xs opacity-70 hover:opacity-100 transition-opacity font-mono px-2 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
                title="查看更多"
              >
                查看更多
              </button>
            )}
          </div>
          
          {displayVideos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {displayVideos.map((item, index) => (
                <a
                  key={`${item.channelName}-${offset + index}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 transition-all group"
                >
                  <div className="relative w-full aspect-video bg-muted overflow-hidden">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <h4 className="text-sm font-semibold text-white mb-1 line-clamp-1">{item.title}</h4>
                      <div className="flex items-center gap-1.5 text-xs text-white/80 font-mono">
                        <span>{item.channelName}</span>
                        <span>•</span>
                        <TimeAgo isoString={item.publishedAt} />
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="p-3 md:p-4 bg-card rounded-sm border border-border/50">
              <div className="text-xs opacity-70 font-mono text-center py-2">
                暂无更新
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
