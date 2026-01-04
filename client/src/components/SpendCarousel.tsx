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

import { useState, useEffect } from "react";
import { MapPin, Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";

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

/**
 * Dice SVG Component
 * A realistic 3D dice with red-orange gradient and glossy finish
 */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Red-orange gradient for dice body */}
        <linearGradient id="diceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="50%" stopColor="#ff8e53" />
          <stop offset="100%" stopColor="#ffa726" />
        </linearGradient>
        {/* Lighter gradient for top face */}
        <linearGradient id="diceTopGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff8e53" />
          <stop offset="100%" stopColor="#ffa726" />
        </linearGradient>
        {/* Darker gradient for right face */}
        <linearGradient id="diceRightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e55555" />
          <stop offset="100%" stopColor="#ff6b6b" />
        </linearGradient>
        {/* Highlight for glossy effect */}
        <linearGradient id="diceHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Shadow */}
        <filter id="diceShadow">
          <feDropShadow dx="3" dy="3" stdDeviation="4" floodOpacity="0.3"/>
        </filter>
      </defs>
      
      {/* Right face (darker) */}
      <polygon 
        points="75,15 90,8 90,75 75,82" 
        fill="url(#diceRightGradient)" 
        opacity="0.9"
      />
      
      {/* Top face (lighter) */}
      <polygon 
        points="15,15 30,8 90,8 75,15" 
        fill="url(#diceTopGradient)" 
      />
      
      {/* Front face (main) */}
      <rect 
        x="15" 
        y="15" 
        width="60" 
        height="67" 
        rx="8" 
        fill="url(#diceGradient)" 
        filter="url(#diceShadow)"
      />
      
      {/* Glossy highlight on front face */}
      <rect 
        x="15" 
        y="15" 
        width="60" 
        height="67" 
        rx="8" 
        fill="url(#diceHighlight)" 
      />
      
      {/* Dots (pips) - white oval shapes */}
      {/* Top face: 1 dot (center) */}
      <ellipse cx="52.5" cy="11.5" rx="4" ry="5" fill="white" opacity="0.95" />
      
      {/* Front face: 2 dots (diagonal) */}
      <ellipse cx="30" cy="35" rx="4" ry="5" fill="white" opacity="0.95" />
      <ellipse cx="60" cy="62" rx="4" ry="5" fill="white" opacity="0.95" />
      
      {/* Right face: 3 dots (diagonal) */}
      <ellipse cx="80" cy="25" rx="3.5" ry="4.5" fill="white" opacity="0.9" />
      <ellipse cx="85" cy="45" rx="3.5" ry="4.5" fill="white" opacity="0.9" />
      <ellipse cx="82" cy="65" rx="3.5" ry="4.5" fill="white" opacity="0.9" />
    </svg>
  );
}

/**
 * Dice Animation Component
 * Animated dice with rotation
 */
function DiceAnimation() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 20) % 360);
    }, 100);

    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="animate-bounce">
      <div style={{ transform: `rotate(${rotation}deg)` }}>
        <DiceIcon className="w-14 h-14 text-primary" />
      </div>
    </div>
  );
}

export default function SpendCarousel({ category, places, fallbackImage, offset = 0, onRefresh }: SpendCarouselProps) {
  // Get fallback image for this category
  const getFallbackImage = () => fallbackImage || CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['中餐'];

  // State for random place selection
  const [isRolling, setIsRolling] = useState(false);
  const [revealedRandomPlace, setRevealedRandomPlace] = useState<SpendPlace | null>(null);
  const [lastPickedId, setLastPickedId] = useState<string | null>(null);

  // Debug logging
  console.log(`[SpendCarousel] Category: "${category}", Places count: ${places.length}, Offset: ${offset}`);
  if (places.length > 0) {
    console.log(`[SpendCarousel] First place:`, places[0]);
  }

  // For 新店打卡: no minimum requirement, show all available places
  // For other categories: if we have < 5 places, show compact placeholder
  if (category !== '新店打卡' && places.length < 5) {
    console.warn(`[SpendCarousel] Category "${category}" has only ${places.length} places, showing compact placeholder`);
    return (
      <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md flex flex-col min-h-[120px]">
        <div className="mb-2 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-[28px] md:text-[32px] font-mono font-semibold text-foreground">
            {category}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <p className="text-xs opacity-60 font-mono font-normal text-center line-clamp-2">
            {places.length === 0 ? '暂无推荐' : '数据不足'}
          </p>
        </div>
      </div>
    );
  }
  
  // For 新店打卡: if empty, show placeholder
  if (category === '新店打卡' && places.length === 0) {
    return (
      <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md flex flex-col min-h-[120px]">
        <div className="mb-2 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-[28px] md:text-[32px] font-mono font-semibold text-foreground">
            {category}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <p className="text-xs opacity-60 font-mono font-normal text-center line-clamp-2">
            暂无推荐
          </p>
        </div>
      </div>
    );
  }

  // For 新店打卡: show all available places (no minimum requirement)
  // For other categories: select 5 places starting from offset (for "换一批" functionality)
  let top5Places: SpendPlace[] = [];
  
  // Use modulo to cycle through places if offset exceeds array length
  const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
  
  if (normalizedOffset + 5 <= places.length) {
    // Normal case: we have enough places from current offset
    top5Places = places.slice(normalizedOffset, normalizedOffset + 5);
  } else {
    // Wrap around: take remaining from current offset + take from start
    const fromEnd = places.slice(normalizedOffset);
    const fromStart = places.slice(0, 5 - fromEnd.length);
    top5Places = [...fromEnd, ...fromStart];
  }

  // Random pool: use all available places (up to 20) for random selection
  const randomPool = places.slice(0, 20);

  // Handle random place selection
  const handleRandomClick = () => {
    if (isRolling || randomPool.length === 0) {
      return;
    }

    // If already revealed, reroll
    if (revealedRandomPlace) {
      setIsRolling(true);
      setRevealedRandomPlace(null);
      
      setTimeout(() => {
        pickRandomPlace();
      }, 1500);
      return;
    }

    // First roll
    setIsRolling(true);
    setTimeout(() => {
      pickRandomPlace();
    }, 1500);
  };

  const pickRandomPlace = () => {
    if (randomPool.length === 0) {
      setIsRolling(false);
      return;
    }

    // Filter out last picked place to avoid immediate repeats
    const availablePlaces = randomPool.filter(p => p.id !== lastPickedId);
    const pool = availablePlaces.length > 0 ? availablePlaces : randomPool;
    
    // Random selection
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selected = pool[randomIndex];
    
    setRevealedRandomPlace(selected);
    setLastPickedId(selected.id);
    setIsRolling(false);
  };

  return (
    <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md flex flex-col h-auto min-h-0">
      {/* Category Header - Top-left with Refresh Button */}
      <div className="mb-2 flex-shrink-0 flex items-center justify-between">
        <h3 className="text-[13px] font-mono font-medium text-foreground/80">
          {category}
        </h3>
        {/* For 新店打卡: no "换一批" button (data may be limited) */}
        {/* For other categories: show "换一批" if places.length > 5 */}
        {onRefresh && category !== '新店打卡' && places.length > 5 && (
          <button
            onClick={onRefresh}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal px-2 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
            title="换一批"
          >
            换一批
          </button>
        )}
      </div>

      {/* Horizontal Carousel - 6 cards: 5 normal places + 1 random */}
      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full min-w-0 relative"
      >
        <CarouselPrevious className="hidden md:flex left-2 z-10 bg-background/80 backdrop-blur-sm hover:bg-background/90" />
        <CarouselNext className="hidden md:flex right-2 z-10 bg-background/80 backdrop-blur-sm hover:bg-background/90" />
        <CarouselContent className="-ml-2 min-w-0 items-stretch">
          {/* Card 1-5: Normal places */}
          {top5Places.map((place) => {
            const photoUrl = place.photo_url || getFallbackImage();
            const isFallback = (place as any).isFallback;
            
            return (
              <CarouselItem key={place.id} className="pl-2 basis-auto flex items-center">
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
                      <h4 className="text-[13px] font-medium mb-0.5 truncate drop-shadow-lg leading-tight">{place.name}</h4>
                      <div className="flex items-baseline gap-1.5 text-[11px] opacity-70 drop-shadow-md font-mono font-normal">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                        <span className="tabular-nums">{place.rating.toFixed(1)}</span>
                        {place.distance_miles !== undefined && (
                          <>
                            <span className="text-white/60">•</span>
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="tabular-nums">{place.distance_miles.toFixed(1)} mi</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              </CarouselItem>
            );
          })}

          {/* Card 6: Random place selector (随机选店) */}
          <CarouselItem className="pl-2 basis-auto flex items-center">
            {revealedRandomPlace ? (
              // Show revealed place
              <a
                href={revealedRandomPlace.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-44 rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 transition-all group"
              >
                <div className="relative w-full h-32 bg-muted overflow-hidden">
                  <img
                    src={revealedRandomPlace.photo_url || getFallbackImage()}
                    alt={revealedRandomPlace.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== getFallbackImage()) {
                        target.src = getFallbackImage();
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 text-white z-10">
                    <h4 className="text-[13px] font-medium mb-0.5 truncate drop-shadow-lg leading-tight">{revealedRandomPlace.name}</h4>
                    <div className="flex items-baseline gap-1.5 text-[11px] opacity-70 drop-shadow-md font-mono font-normal">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                      <span className="tabular-nums">{revealedRandomPlace.rating.toFixed(1)}</span>
                      {revealedRandomPlace.distance_miles !== undefined && (
                        <>
                          <span className="text-white/60">•</span>
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="tabular-nums">{revealedRandomPlace.distance_miles.toFixed(1)} mi</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] opacity-80 font-mono font-normal">
                      随机选店
                    </div>
                  </div>
                </div>
              </a>
            ) : (
              // Show dice button
              <button
                onClick={handleRandomClick}
                disabled={isRolling || randomPool.length === 0}
                className="block w-44 rounded-lg bg-card/50 border border-border/50 hover:border-primary/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="relative w-full h-32 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  {isRolling ? (
                    <DiceAnimation />
                  ) : (
                    <DiceIcon className="w-14 h-14 text-primary/70" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    {isRolling ? (
                      <h4 className="text-[13px] font-medium text-white leading-tight">
                        摇色子中...
                      </h4>
                    ) : (
                      <p className="text-[11px] text-white/70 font-mono font-normal">随机选店</p>
                    )}
                  </div>
                </div>
              </button>
            )}
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  );
}
