/**
 * US Stock YouTubers Component
 * 美股博主独立组件
 * Desktop & Mobile: 横向 carousel，带滚动按钮
 * "更多"按钮：轮换视频列表 index
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import TimeAgo from "@/components/TimeAgo";
import { useMemo } from "react";

interface USStockYouTubersProps {
  stockYoutubers: any[];
  offset?: number; // Current display offset (for "换一批" functionality)
  onRefresh?: () => void; // Callback for "换一批" button
}

export default function USStockYouTubers({ stockYoutubers, offset = 0, onRefresh }: USStockYouTubersProps) {
  // Filter and prepare videos
  const availableVideos = stockYoutubers.filter(item => item.status === 'ok');
  
  // Use all available videos for carousel (no padding needed)
  const displayVideos = availableVideos.length > 0 ? availableVideos : [];
  
  const hasMore = availableVideos.length > 0;

  // Calculate latest video time for status hint
  const latestVideoTime = useMemo(() => {
    if (displayVideos.length === 0) return null;
    const times = displayVideos
      .map(v => v.publishedAt)
      .filter(Boolean)
      .map(t => new Date(t).getTime())
      .filter(t => !isNaN(t));
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }, [displayVideos]);

  // Format status hint
  const statusHint = useMemo(() => {
    if (!latestVideoTime) return null;
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - latestVideoTime.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `更新于 ${diffMinutes} 分钟前`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `更新于 ${hours} 小时前`;
    } else {
      return '今日热门';
    }
  }, [latestVideoTime]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-mono font-medium text-foreground/80">美股博主</h3>
          {statusHint && (
            <span className="text-xs opacity-60 font-mono font-normal text-foreground/60">
              {statusHint}
            </span>
          )}
        </div>
        {onRefresh && (hasMore || availableVideos.length > 0) && (
          <button
            onClick={onRefresh}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal px-2 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
            title="更多"
          >
            更多
          </button>
        )}
      </div>

      {/* Carousel with scroll buttons */}
      {displayVideos.length > 0 ? (
        <div className="relative">
          <Carousel
            opts={{
              align: "start",
              loop: false,
              dragFree: true,
            }}
            className="w-full"
          >
            <CarouselPrevious className="hidden md:flex -left-12" />
            <CarouselNext className="hidden md:flex -right-12" />
            <CarouselContent className="-ml-2 md:-ml-4">
              {displayVideos.map((item, index) => (
                <CarouselItem 
                  key={`${item.channelName}-${offset + index}`} 
                  className="pl-2 md:pl-4 snap-start shrink-0 w-[70%] md:w-[25%] max-w-[280px] md:max-w-none min-w-0"
                >
                  <a
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
                        <h4 className="text-[14px] font-medium text-white mb-1 line-clamp-1">{item.title}</h4>
                        <div className="flex items-center gap-1.5 text-xs opacity-70 text-white/80 font-mono font-normal">
                          <span>{item.channelName}</span>
                          <span>•</span>
                          <TimeAgo isoString={item.publishedAt} />
                        </div>
                      </div>
                    </div>
                  </a>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      ) : (
        <div className="p-4 bg-card rounded-sm border border-border/40 shadow-md">
          <div className="text-xs opacity-60 font-mono font-normal text-center py-2">
            暂无更新
          </div>
        </div>
      )}
    </div>
  );
}
