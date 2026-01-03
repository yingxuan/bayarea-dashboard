/**
 * Shows Carousel Component
 * Horizontal carousel for TV shows (追剧)
 * Cards: 腾讯视频 / 优酷 / 芒果TV (or existing providers)
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import ShowsCard from "@/components/ShowsCard";

interface ShowsCarouselProps {
  shows: any[];
}

export default function ShowsCarousel({ shows }: ShowsCarouselProps) {
  if (shows.length === 0) {
    return null;
  }

  // Map shows to display format (supports both TMDB and YouTube formats)
  // No limit - show all shows
  const displayShows = shows.map((show: any) => ({
    id: String(show.id || show.videoId || Date.now()),
    title: show.title || show.name || '',
    description: show.description || show.overview || '',
    poster: show.poster_url || show.poster || show.thumbnail || '',
    rating: show.rating || show.vote_average || 0,
    platform: show.platform || 'YouTube',
    url: show.url || `https://www.youtube.com/watch?v=${show.id}`,
  }));

  return (
    <Carousel
      opts={{
        align: "start",
        loop: false,
        dragFree: true,
      }}
      className="w-full relative"
    >
      <CarouselContent className="-ml-2 min-w-0">
        {displayShows.map((show) => (
          <CarouselItem key={show.id} className="pl-2 snap-start shrink-0 w-[70%] max-w-[280px] min-w-0">
            <a
              href={show.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 transition-all group"
            >
              <div className="relative w-full aspect-video bg-muted overflow-hidden">
                <img
                  src={show.poster}
                  alt={show.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <h4 className="text-sm font-semibold text-white mb-1 line-clamp-1">{show.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-white/80">
                    {show.rating > 0 && (
                      <>
                        <span>⭐ {show.rating.toFixed(1)}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{show.platform}</span>
                  </div>
                </div>
              </div>
            </a>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2 md:left-4" />
      <CarouselNext className="right-2 md:right-4" />
    </Carousel>
  );
}
