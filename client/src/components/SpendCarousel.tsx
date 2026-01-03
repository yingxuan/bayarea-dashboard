/**
 * Spend Carousel Component
 * Image-driven horizontal carousel for food recommendations
 * 
 * Requirements:
 * - Horizontal scroll carousel
 * - Shows 3 cards: 2 real places + 1 blind box
 * - Large images (80% visual, 20% text)
 * - Show partial next card
 * - Category-level fallback images
 * - Never show empty sections
 */

import { MapPin, Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import BlindBoxCard from "./BlindBoxCard";

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
  photo_url?: string;
  maps_url: string;
  city: string;
}

interface SpendCarouselProps {
  category: string;
  places: SpendPlace[];
  fallbackImage?: string;
  offset?: number; // Current display offset (for "换一批" functionality)
  onRefresh?: () => void; // Callback for "换一批" button
}

// Category fallback images (placeholder URLs - can be replaced with actual images)
const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  '奶茶': 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=400&h=300&fit=crop',
  '中餐': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
  '咖啡': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop',
  '夜宵': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
};

export default function SpendCarousel({ category, places, fallbackImage, offset = 0, onRefresh }: SpendCarouselProps) {
  // Get fallback image for this category
  const getFallbackImage = () => fallbackImage || CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['中餐'];

  // Debug logging
  console.log(`[SpendCarousel] Category: "${category}", Places count: ${places.length}, Offset: ${offset}`);
  if (places.length > 0) {
    console.log(`[SpendCarousel] First place:`, places[0]);
  }

  // If we have < 2 real places, show compact placeholder instead of huge empty area
  if (places.length < 2) {
    console.warn(`[SpendCarousel] Category "${category}" has only ${places.length} places, showing compact placeholder`);
    return (
      <div className="rounded-sm p-2 bg-card border border-border/50 flex flex-col h-24">
        <div className="mb-1 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-xs font-semibold font-mono text-foreground/90">
            {category}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <p className="text-xs text-muted-foreground font-mono text-center line-clamp-2">
            暂时无法获取附近热门店
          </p>
        </div>
      </div>
    );
  }

  // Select 2 places starting from offset (for "换一批" functionality)
  // Use modulo to cycle through places if offset exceeds array length
  const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
  let top2Places: SpendPlace[] = [];
  
  if (normalizedOffset + 2 <= places.length) {
    // Normal case: we have enough places from current offset
    top2Places = places.slice(normalizedOffset, normalizedOffset + 2);
  } else {
    // Wrap around: take remaining from current offset + take from start
    const fromEnd = places.slice(normalizedOffset);
    const fromStart = places.slice(0, 2 - fromEnd.length);
    top2Places = [...fromEnd, ...fromStart];
  }
  
  // For blind box pool, use places that are not currently displayed
  // Exclude the current 2 places and take next 4
  const excludedIndices = new Set<number>();
  if (normalizedOffset + 2 <= places.length) {
    excludedIndices.add(normalizedOffset);
    excludedIndices.add(normalizedOffset + 1);
  } else {
    // Handle wrap-around case
    for (let i = normalizedOffset; i < places.length; i++) {
      excludedIndices.add(i);
    }
    for (let i = 0; i < 2 - (places.length - normalizedOffset); i++) {
      excludedIndices.add(i);
    }
  }
  
  const randomPool = places
    .map((place, index) => ({ place, index }))
    .filter(({ index }) => !excludedIndices.has(index))
    .slice(0, 4)
    .map(({ place }) => place);

  // Ensure random pool has at least 1 item
  const finalRandomPool = randomPool.length > 0 ? randomPool : places.slice(0, 1);

  return (
    <div className="rounded-sm p-2 bg-card border border-border/50 flex flex-col h-auto min-h-0">
      {/* Category Header - Top-left with Refresh Button */}
      <div className="mb-2 flex-shrink-0 flex items-center justify-between">
        <h3 className="text-xs font-semibold font-mono text-foreground/90">
          {category}
        </h3>
        {onRefresh && places.length > 2 && (
          <button
            onClick={onRefresh}
            className="text-xs text-primary hover:text-primary/80 transition-colors font-mono px-2 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
            title="换一批"
          >
            换一批
          </button>
        )}
      </div>

      {/* Horizontal Carousel - Compact for grid: 2 real places + 1 blind box */}
      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full min-w-0"
      >
        <CarouselContent className="-ml-2 min-w-0">
          {/* Card 1-2: Real places */}
          {top2Places.map((place) => {
            const photoUrl = place.photo_url || getFallbackImage();
            const isFallback = (place as any).isFallback;
            
            return (
              <CarouselItem key={place.id} className="pl-2 basis-auto">
                <a
                  href={isFallback ? '#' : place.maps_url}
                  target={isFallback ? undefined : "_blank"}
                  rel={isFallback ? undefined : "noopener noreferrer"}
                  className="block w-44 rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 transition-all group"
                >
                  {/* Large Image - Compact for grid with dark gradient overlay */}
                  <div className="relative w-full h-32 bg-muted overflow-hidden">
                    <img
                      src={photoUrl}
                      alt={place.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        // Fallback to category image if photo fails to load
                        const target = e.target as HTMLImageElement;
                        if (target.src !== getFallbackImage()) {
                          target.src = getFallbackImage();
                        }
                      }}
                    />
                    {/* Dark gradient overlay for better text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    
                    {/* Overlay: Name + Rating + Distance (bottom-left) */}
                    <div className="absolute bottom-0 left-0 right-0 p-2 text-white z-10">
                      <h4 className="text-sm font-semibold mb-1 truncate drop-shadow-lg">{place.name}</h4>
                      <div className="flex items-center gap-1.5 text-xs drop-shadow-md">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{place.rating.toFixed(1)}</span>
                        {place.distance_miles !== undefined && (
                          <>
                            <span className="text-white/70">•</span>
                            <MapPin className="w-3 h-3" />
                            <span>{place.distance_miles.toFixed(1)} mi</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              </CarouselItem>
            );
          })}

          {/* Card 3: Blind Box */}
          <CarouselItem className="pl-2 basis-auto">
            <BlindBoxCard
              randomPool={finalRandomPool}
              fallbackImage={getFallbackImage()}
            />
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  );
}
