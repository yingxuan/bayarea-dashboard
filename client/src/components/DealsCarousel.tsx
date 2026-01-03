/**
 * Deals Carousel Component
 * Horizontal carousel for deals (薅羊毛)
 * Compact deal cards in a horizontal swipe row
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

interface Deal {
  id: string;
  title: string;
  url: string;
  external_url?: string;
  store: string;
  score: number;
  comments: number;
  time_ago: string;
}

interface DealsCarouselProps {
  deals: Deal[];
}

export default function DealsCarousel({ deals }: DealsCarouselProps) {
  if (deals.length === 0) {
    return null;
  }

  return (
    <Carousel
      opts={{
        align: "start",
        loop: false,
        dragFree: true,
      }}
      className="w-full"
    >
      <CarouselContent className="-ml-2 min-w-0">
        {deals.slice(0, 6).map((deal) => (
          <CarouselItem key={deal.id} className="pl-2 snap-start shrink-0 w-[85%] max-w-[420px] min-w-0">
            <a
              href={deal.external_url || deal.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-sm p-4 bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-60 text-muted-foreground font-mono font-normal">{deal.store || 'Deal'}</span>
                  <span className="text-xs opacity-60 text-muted-foreground">•</span>
                  <span className="text-xs opacity-60 text-muted-foreground font-mono font-normal">{deal.time_ago || ''}</span>
                </div>
                {deal.score > 0 && (
                  <div className="flex-shrink-0 text-xs text-primary font-mono font-medium tabular-nums">
                    ↑{deal.score}
                  </div>
                )}
              </div>
              <h4 className="text-[14px] font-normal font-mono text-foreground/90 group-hover:text-primary transition-colors line-clamp-2" style={{ lineHeight: '1.4' }}>
                {deal.title}
              </h4>
              {deal.comments > 0 && (
                <div className="mt-2 text-xs opacity-60 text-muted-foreground font-mono font-normal">
                  💬 {deal.comments} 评论
                </div>
              )}
            </a>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
