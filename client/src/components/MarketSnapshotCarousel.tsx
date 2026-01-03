/**
 * Market Snapshot Carousel Component
 * Horizontal carousel with 3 cards: 市场温度, Top Movers, 市场要闻
 * Mobile: ~80% screen width per card, show partial next card
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import FinanceOverview from "@/components/FinanceOverview";

interface MarketSnapshotCarouselProps {
  marketNews: any[];
}

export default function MarketSnapshotCarousel({ marketNews }: MarketSnapshotCarouselProps) {
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
      <CarouselContent className="-ml-2 min-w-0">
        {/* Card A: 市场温度 */}
        <CarouselItem className="pl-2 snap-start shrink-0 w-[85%] max-w-[420px] min-w-0">
          <div className="h-auto w-full">
            <FinanceOverview compactMode={true} showMarketTemperatureOnly={true} />
          </div>
        </CarouselItem>

        {/* Card B: Top Movers */}
        <CarouselItem className="pl-2 snap-start shrink-0 w-[85%] max-w-[420px] min-w-0">
          <div className="h-auto w-full">
            <FinanceOverview compactMode={true} showTopMoversOnly={true} />
          </div>
        </CarouselItem>

        {/* Card C: 市场要闻 */}
        <CarouselItem className="pl-2 snap-start shrink-0 w-[85%] max-w-[420px] min-w-0">
          <div className="h-auto w-full rounded-sm p-2 bg-card border border-border/50">
            <h3 className="text-xs font-semibold font-mono text-foreground/70 mb-1.5">市场要闻</h3>
            {marketNews.length > 0 ? (
              <div className="space-y-1.5">
                {marketNews.slice(0, 3).map((item: any, index: number) => (
                  <a
                    key={index}
                    href={item.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-1.5 hover:bg-card/80 transition-all group rounded-sm"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5 text-xs flex-shrink-0">•</span>
                      <span className="text-xs font-mono text-foreground/80 group-hover:text-primary transition-colors line-clamp-1 leading-tight flex-1">
                        {item.title || item.title_zh || item.title_en || 'Market News'}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="p-1.5">
                <div className="text-xs text-muted-foreground font-mono text-center py-1">
                  暂无市场要闻
                </div>
              </div>
            )}
          </div>
        </CarouselItem>
      </CarouselContent>
    </Carousel>
  );
}
