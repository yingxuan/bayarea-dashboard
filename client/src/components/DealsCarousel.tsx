/**
 * Deals Carousel Component
 * Horizontal carousel for deals (薅羊毛)
 * Compact deal cards in a horizontal swipe row
 * Shows source label and mode (live/cache/seed)
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import TimeAgo from "@/components/TimeAgo";

interface Deal {
  id: string;
  title: string;
  url: string;
  external_url?: string;
  source?: string; // Source name (Slickdeals, DoC, Reddit)
  sourceLabel?: string; // Display label
  sourceMode?: 'live' | 'cache' | 'seed'; // Data source mode
  score?: number;
  publishedAt?: string; // ISO date string
  // Legacy fields for backward compatibility
  store?: string;
  comments?: number;
  time_ago?: string;
}

interface DealsCarouselProps {
  deals: Deal[];
  sourceMode?: 'live' | 'cache' | 'seed'; // Overall source mode
}

export default function DealsCarousel({ deals, sourceMode }: DealsCarouselProps) {
  if (deals.length === 0) {
    return null;
  }

  // Ensure >= 3 items for display
  const displayDeals = deals.length >= 3 ? deals.slice(0, 10) : deals;

  // Mode label mapping
  const modeLabels: Record<string, string> = {
    live: '实时',
    cache: '缓存',
    seed: '种子',
  };

  return (
    <div className="w-full">
      {/* Source mode indicator (subtle, top-right) */}
      {sourceMode && (
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className="text-xs opacity-50 text-muted-foreground font-mono">
            {modeLabels[sourceMode] || sourceMode}
          </span>
        </div>
      )}
      
      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 min-w-0">
          {displayDeals.map((deal) => (
            <CarouselItem key={deal.id} className="pl-2 snap-start shrink-0 w-[85%] max-w-[420px] min-w-0">
              <a
                href={deal.external_url || deal.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-sm p-4 bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs opacity-60 text-muted-foreground font-mono font-normal">
                      {deal.sourceLabel || deal.source || deal.store || 'Deal'}
                    </span>
                    {deal.publishedAt && (
                      <>
                        <span className="text-xs opacity-60 text-muted-foreground">•</span>
                        <TimeAgo isoString={deal.publishedAt} />
                      </>
                    )}
                    {!deal.publishedAt && deal.time_ago && (
                      <>
                        <span className="text-xs opacity-60 text-muted-foreground">•</span>
                        <span className="text-xs opacity-60 text-muted-foreground font-mono font-normal">{deal.time_ago}</span>
                      </>
                    )}
                  </div>
                  {deal.score !== undefined && deal.score > 0 && (
                    <div className="flex-shrink-0 text-xs text-primary font-mono font-medium tabular-nums">
                      ↑{deal.score}
                    </div>
                  )}
                </div>
                <h4 className="text-[14px] font-normal font-mono text-foreground/90 group-hover:text-primary transition-colors line-clamp-2" style={{ lineHeight: '1.4' }}>
                  {deal.title}
                </h4>
                {deal.comments !== undefined && deal.comments > 0 && (
                  <div className="mt-2 text-xs opacity-60 text-muted-foreground font-mono font-normal">
                    💬 {deal.comments} 评论
                  </div>
                )}
              </a>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
