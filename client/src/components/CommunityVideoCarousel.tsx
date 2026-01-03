/**
 * Community & Video Carousel Component
 * Horizontal carousel with 2 cards: 一亩三分地讨论, 美股 YouTube
 * Mobile: ~80% screen width per card, show partial next card
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import LeekCommunity from "@/components/LeekCommunity";
import YouTubersList from "@/components/YouTubersList";
import { ArrowRight } from "lucide-react";

interface CommunityVideoCarouselProps {
  stockYoutubers: any[];
}

export default function CommunityVideoCarousel({ stockYoutubers }: CommunityVideoCarouselProps) {
  return (
    <Carousel
      opts={{
        align: "start",
        loop: false,
        dragFree: true,
        containScroll: "trimSnaps",
      }}
      className="w-full"
    >
      <CarouselContent className="-ml-2">
        {/* Card A: 一亩三分地讨论 */}
        <CarouselItem className="pl-2 basis-[85%] flex-shrink-0 min-w-0">
          <div className="h-auto w-full flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-semibold font-mono text-foreground/70">一亩三分地</h3>
              <a
                href="https://www.1point3acres.com/bbs/forum.php?mod=forumdisplay&fid=291"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono flex items-center gap-1"
              >
                查看更多
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            <div className="min-h-0">
              <LeekCommunity maxItems={3} hideTitle={true} />
            </div>
          </div>
        </CarouselItem>

        {/* Card B: 美股 YouTube */}
        <CarouselItem className="pl-2 basis-[85%] flex-shrink-0 min-w-0">
          <div className="h-auto w-full flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-semibold font-mono text-foreground/70">美股博主</h3>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono flex items-center gap-1"
              >
                查看更多
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            <div className="min-h-0">
              {stockYoutubers.length > 0 ? (
                <YouTubersList items={stockYoutubers.slice(0, 2)} maxItems={2} />
              ) : (
                <div className="p-2 bg-card rounded-sm">
                  <div className="text-xs text-muted-foreground font-mono text-center py-1">
                    暂无更新
                  </div>
                </div>
              )}
            </div>
          </div>
        </CarouselItem>
      </CarouselContent>
    </Carousel>
  );
}
