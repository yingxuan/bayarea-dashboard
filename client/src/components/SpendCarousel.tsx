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
}

// Category fallback images (placeholder URLs - can be replaced with actual images)
const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  '奶茶': 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=400&h=300&fit=crop',
  '中餐': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
  '咖啡': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop',
  '夜宵': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
};

export default function SpendCarousel({ category, places, fallbackImage }: SpendCarouselProps) {
  // Get fallback image for this category
  const getFallbackImage = () => fallbackImage || CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['中餐'];

  // Debug logging
  console.log(`[SpendCarousel] Category: "${category}", Places count: ${places.length}`);
  if (places.length > 0) {
    console.log(`[SpendCarousel] First place:`, places[0]);
  }

  // If we have < 2 real places, show placeholder instead of fake data
  if (places.length < 2) {
    console.warn(`[SpendCarousel] Category "${category}" has only ${places.length} places, showing placeholder`);
    return (
      <div className="glow-border rounded-sm p-3 bg-card h-full flex flex-col">
        <div className="mb-3 flex-shrink-0">
          <h3 className="text-sm font-semibold font-mono text-foreground/90">
            {category}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground font-mono text-center">
            暂时无法获取附近热门店
          </p>
        </div>
      </div>
    );
  }

  // Select top 2 places for cards 1-2, remaining 4+ for blind box pool
  const top2Places = places.slice(0, 2);
  const randomPool = places.slice(2, 6); // Next 4 places for blind box

  // Ensure random pool has at least 1 item (if we have 3+ places)
  const finalRandomPool = randomPool.length > 0 ? randomPool : places.slice(2, 3);

  return (
    <div className="glow-border rounded-sm p-3 bg-card h-full flex flex-col">
      {/* Category Header - Top-left */}
      <div className="mb-3 flex-shrink-0">
        <h3 className="text-sm font-semibold font-mono text-foreground/90">
          {category}
        </h3>
      </div>

      {/* Horizontal Carousel - Compact for grid: 2 real places + 1 blind box */}
      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full flex-1"
      >
        <CarouselContent className="-ml-2">
          {/* Card 1-2: Real places */}
          {displayPlaces.map((place) => {
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
                  {/* Large Image - Compact for grid */}
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
                    
                    {/* Overlay: Name (bottom-left) */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <h4 className="text-xs font-semibold text-white line-clamp-1">
                        {place.name}
                      </h4>
                    </div>
                  </div>

                  {/* Info: Rating + Distance (below image) - Compact */}
                  <div className="p-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <div className="flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                        <span>{place.rating.toFixed(1)}</span>
                      </div>
                      {place.distance_miles !== undefined && (
                        <>
                          <span>·</span>
                          <div className="flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />
                            <span>{place.distance_miles.toFixed(1)} mi</span>
                          </div>
                        </>
                      )}
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
