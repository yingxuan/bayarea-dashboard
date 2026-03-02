/**
 * Shows Carousel Component
 * Horizontal carousel for TV shows (追剧)
 * Cards: 腾讯视频 / 优酷 / 芒果TV (or existing providers)
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import ShowsCard from "@/components/ShowsCard";

interface ShowsCarouselProps {
  shows: any[];
  offset?: number; // Current display offset (for "换一批" functionality)
  onRefresh?: () => void; // Callback for "换一批" button
}

export default function ShowsCarousel({ shows, offset = 0, onRefresh }: ShowsCarouselProps) {
  if (shows.length === 0) {
    return null;
  }

  // Map shows to display format (supports both TMDB and YouTube formats)
  const allDisplayShows = shows.map((show: any) => ({
    id: String(show.id || show.videoId || Date.now()),
    title: show.title || show.name || '',
    description: show.description || show.overview || '',
    poster: show.poster_url || show.poster || show.thumbnail || '',
    rating: show.rating || show.vote_average || 0,
    platform: show.platform || 'YouTube',
    url: show.url || `https://www.youtube.com/watch?v=${show.id}`,
  }));

  // Group shows by platform (channel)
  const showsByPlatform: Record<string, typeof allDisplayShows> = {};
  allDisplayShows.forEach(show => {
    const platform = show.platform || '其他';
    if (!showsByPlatform[platform]) {
      showsByPlatform[platform] = [];
    }
    showsByPlatform[platform].push(show);
  });

  // Get platforms in order (prefer: 腾讯视频, 优酷, 芒果TV, then others)
  const platformOrder = ['腾讯视频', '优酷', '芒果TV'];
  const orderedPlatforms = [
    ...platformOrder.filter(p => showsByPlatform[p]?.length > 0),
    ...Object.keys(showsByPlatform).filter(p => !platformOrder.includes(p))
  ];

  // Select 2 shows per platform, up to 4 platforms (8 total)
  // Use offset to rotate through shows within each platform
  const displayShows: typeof allDisplayShows = [];
  const SHOWS_PER_PLATFORM = 2;
  const MAX_PLATFORMS = 4;
  
  for (let i = 0; i < Math.min(orderedPlatforms.length, MAX_PLATFORMS); i++) {
    const platform = orderedPlatforms[i];
    const platformShows = showsByPlatform[platform] || [];
    if (platformShows.length === 0) continue;
    
    // Use offset to rotate: start from offset, take 2 shows
    // Each platform rotates independently based on offset
    const startIdx = (offset * SHOWS_PER_PLATFORM) % Math.max(platformShows.length, 1);
    const selectedShows = [];
    for (let j = 0; j < SHOWS_PER_PLATFORM && j < platformShows.length; j++) {
      const idx = (startIdx + j) % platformShows.length;
      selectedShows.push(platformShows[idx]);
    }
    displayShows.push(...selectedShows);
  }
  
  // If we have more platforms or more shows per platform, enable "换一批"
  const hasMore = orderedPlatforms.length > MAX_PLATFORMS || 
                  Object.values(showsByPlatform).some(shows => shows.length > SHOWS_PER_PLATFORM);

  return (
    <div className="w-full">
      {/* Header with 换一批 button */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/30">
        <h3 className="text-[13px] font-mono font-medium text-foreground/70">追剧</h3>
        {onRefresh && hasMore && (
          <button
            onClick={onRefresh}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal px-2 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
          >
            换一批
          </button>
        )}
      </div>

      <div className="relative">
        <Carousel
          opts={{
            align: "start",
            loop: false,
            dragFree: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4 min-w-0">
            {displayShows.map((show) => (
              <CarouselItem key={show.id} className="pl-2 md:pl-4 snap-start shrink-0 w-[70%] md:w-[50%] min-w-0">
              <a
                href={show.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-sm overflow-hidden bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
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
                    <h4 className="text-[13px] font-medium text-white mb-0.5 line-clamp-1 leading-tight">{show.title}</h4>
                    <div className="flex items-baseline gap-1.5 text-[11px] opacity-70 text-white/80 font-mono font-normal">
                      {show.rating > 0 && (
                        <>
                          <span className="tabular-nums">⭐ {show.rating.toFixed(1)}</span>
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
        </Carousel>
      </div>
    </div>
  );
}
