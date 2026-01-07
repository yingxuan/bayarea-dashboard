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

import { useState, useEffect, useMemo } from "react";
import { MapPin, Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { refreshNewPlaces, getNewPlacesPool } from "@/hooks/usePlacesCache";
import { getCacheAgeDays } from "@/lib/places/localCache";
import { enrichPlace, getEnrichmentStats } from "@/lib/places/placeEnricher";
import { getEnrichmentKey, getEnriched } from "@/lib/places/enrichmentCache";
import { config } from "@/config";

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
  
  // State for enriched places (rating, photo from Places API)
  const [enrichedPlaces, setEnrichedPlaces] = useState<Map<string, { rating: number; userRatingCount: number; photoUrl?: string }>>(new Map());

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
  const top5Places = useMemo(() => {
    let result: SpendPlace[] = [];
    
    // STEP 5: For 夜宵, show all places (no opening hours filter)
    // Opening hours filter has been removed - all 夜宵 places from seed file are shown
    if (category === '夜宵') {
      // Show all places without filtering by opening hours
      const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
      
      if (normalizedOffset + 5 <= places.length) {
        result = places.slice(normalizedOffset, normalizedOffset + 5);
      } else {
        const fromEnd = places.slice(normalizedOffset);
        const fromStart = places.slice(0, 5 - fromEnd.length);
        result = [...fromEnd, ...fromStart];
      }
      
      if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
        console.log(`[SpendCarousel] 夜宵: Showing ${result.length} places (no opening hours filter applied)`);
      }
      
      return result;
    }
    
    // STEP 7: For 新店打卡, filter using seed file enriched data (rating, userRatingCount)
    if (category === '新店打卡') {
      // Filter places based on seed file enriched data (place.rating, place.user_ratings_total)
      // or runtime enriched data if available
      const filtered = places.filter(place => {
        const enrichmentKey = getEnrichmentKey(place.id, place.name, place.city);
        const enriched = enrichedPlaces.get(enrichmentKey);
        
        // Use runtime enriched data if available, otherwise use seed file enriched data
        // IMPORTANT: Always check seed file data first to enforce >= 500 filter
        const seedRatingCount = place.user_ratings_total ?? 0;
        const enrichedRatingCount = enriched?.userRatingCount;
        
        // Use the higher value to ensure we don't miss any >= 500 cases
        const ratingCount = enrichedRatingCount ?? seedRatingCount;
        const rating = enriched?.rating ?? (place.rating && place.rating > 0 ? place.rating : 0);
        
        // Hard exclude: >= 500 ratingCount is NEVER "new-ish" (MANDATORY FILTER)
        // This must be checked FIRST, before any other logic
        if (ratingCount >= 500) {
          if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
            console.log(`[SpendCarousel] 新店打卡: Excluding ${place.name} (ratingCount: ${ratingCount} >= 500) - HARD EXCLUDE`);
          }
          return false;
        }
        
        // Apply filter using available data (from seed file or runtime enrichment)
        if (rating > 0 && ratingCount > 0) {
          // Primary: rating >= 4.0, count <= 150
          if (rating >= 4.0 && ratingCount <= 150) {
            if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
              console.log(`[SpendCarousel] 新店打卡: Including ${place.name} (rating: ${rating}, count: ${ratingCount}) - PRIMARY`);
            }
            return true;
          }
          // Fallback: rating >= 3.8, count <= 250
          if (rating >= 3.8 && ratingCount <= 250) {
            if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
              console.log(`[SpendCarousel] 新店打卡: Including ${place.name} (rating: ${rating}, count: ${ratingCount}) - FALLBACK`);
            }
            return true;
          }
          // Extended fallback: rating >= 3.5, count <= 500 (but still exclude >= 500 from hard rule above)
          if (rating >= 3.5 && ratingCount < 500) {
            if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
              console.log(`[SpendCarousel] 新店打卡: Including ${place.name} (rating: ${rating}, count: ${ratingCount}) - EXTENDED FALLBACK`);
            }
            return true;
          }
          if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
            console.log(`[SpendCarousel] 新店打卡: Excluding ${place.name} (rating: ${rating}, count: ${ratingCount} - doesn't meet thresholds)`);
          }
          return false;
        }
        
        // If no rating/count data available, allow it (new places may not have data yet)
        // For "新店打卡", we allow places without rating/count data because:
        // 1. They are new places that may not have enough reviews yet
        // 2. Seed data may not be enriched yet
        // 3. We'll enrich them later and filter out >= 500 if needed
        if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
          console.log(`[SpendCarousel] 新店打卡: Including ${place.name} (no rating/count data yet, will enrich later)`);
        }
        return true;
      });
      
      // Use modulo to cycle through filtered places
      const normalizedOffset = Math.max(0, Math.min(offset, filtered.length - 1));
      
      if (normalizedOffset + 5 <= filtered.length) {
        result = filtered.slice(normalizedOffset, normalizedOffset + 5);
      } else {
        const fromEnd = filtered.slice(normalizedOffset);
        const fromStart = filtered.slice(0, 5 - fromEnd.length);
        result = [...fromEnd, ...fromStart];
      }
      
      return result;
    }
    
    // Other categories: normal rotation
    const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
    
    if (normalizedOffset + 5 <= places.length) {
      // Normal case: we have enough places from current offset
      result = places.slice(normalizedOffset, normalizedOffset + 5);
    } else {
      // Wrap around: take remaining from current offset + take from start
      const fromEnd = places.slice(normalizedOffset);
      const fromStart = places.slice(0, 5 - fromEnd.length);
      result = [...fromEnd, ...fromStart];
    }
    
    return result;
  }, [places, offset, category, enrichedPlaces]);

  // STEP 5: Load enrichment cache and schedule enrichment for missing items
  useEffect(() => {
    async function loadAndEnrich() {
      // Load ALL places (not just top5) to filter properly
      const allPlacesToCheck = places;
      if (allPlacesToCheck.length === 0) return;

      // Load cached enrichments for ALL places (for filtering)
      const keys = allPlacesToCheck.map(place => 
        getEnrichmentKey(place.id, place.name, place.city)
      );
      
      const cachedEnrichments = await Promise.all(
        keys.map(key => getEnriched(key))
      );

      // Update state with cached enrichments for ALL places
      const newEnriched = new Map<string, { rating: number; userRatingCount: number; photoUrl?: string }>();
      for (let i = 0; i < allPlacesToCheck.length; i++) {
        const place = allPlacesToCheck[i];
        const enriched = cachedEnrichments[i];
        if (enriched) {
          const key = getEnrichmentKey(place.id, place.name, place.city);
          newEnriched.set(key, {
            rating: enriched.rating,
            userRatingCount: enriched.userRatingCount,
            photoUrl: enriched.photo?.photoUrl,
          });
        }
      }
      setEnrichedPlaces(newEnriched);


      // Schedule enrichment for missing items (non-blocking, respect MAX_ENRICH_CALLS)
      // Enrich ALL places (not just top5) so filtering works correctly
      let enrichCount = 0;
      for (let i = 0; i < allPlacesToCheck.length && enrichCount < 3; i++) {
        const place = allPlacesToCheck[i];
        if (!cachedEnrichments[i] && place.id) {
          enrichCount++;
          // Enrich in background (don't await)
          enrichPlace(place.name, place.city, place.id).then(enriched => {
            if (enriched) {
              const key = getEnrichmentKey(place.id, place.name, place.city);
              setEnrichedPlaces(prev => {
                const updated = new Map(prev);
                updated.set(key, {
                  rating: enriched.rating,
                  userRatingCount: enriched.userRatingCount,
                  photoUrl: enriched.photo?.photoUrl,
                });
                return updated;
              });
            }
          }).catch(error => {
            console.error('[SpendCarousel] Error enriching place:', error);
          });
        }
      }


      // Log stats (dev only)
      if (import.meta.env.DEV) {
        const stats = await getEnrichmentStats();
        console.log('[SpendCarousel] Enrichment stats:', {
          cacheHitCount: cachedEnrichments.filter(e => e !== null).length,
          cacheMissCount: cachedEnrichments.filter(e => e === null).length,
          callsMadeThisSession: stats.callsMadeThisSession,
          inCooldown: stats.inCooldown,
        });
      }
    }

    loadAndEnrich();
  }, [places.map(p => `${p.id || ''}_${p.name}_${p.city}`).join('|'), category]);

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

    // Enrich the random place if not cached (non-blocking)
    const enrichmentKey = getEnrichmentKey(selected.id, selected.name, selected.city);
    if (!enrichedPlaces.has(enrichmentKey)) {
      getEnriched(enrichmentKey).then(cached => {
        if (!cached) {
          // Not in cache, enrich it
          enrichPlace(selected.name, selected.city, selected.id).then(enriched => {
            if (enriched) {
              setEnrichedPlaces(prev => {
                const updated = new Map(prev);
                updated.set(enrichmentKey, {
                  rating: enriched.rating,
                  userRatingCount: enriched.userRatingCount,
                  photoUrl: enriched.photo?.photoUrl,
                });
                return updated;
              });
            }
          }).catch(error => {
            console.error('[SpendCarousel] Error enriching random place:', error);
          });
        }
      });
    }
  };

  return (
    <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md flex flex-col h-auto min-h-0">
      {/* Category Header - Top-left with Refresh Button */}
      <div className="mb-2 flex-shrink-0 flex items-center justify-between">
        <h3 className="text-[13px] font-mono font-medium text-foreground/80">
          {category}
        </h3>
        <div className="flex items-center gap-2">
          {/* For 新店打卡: show manual refresh button (debug mode only) */}
          {/* {category === '新店打卡' && (() => {
            const isDev = import.meta.env.DEV;
            const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const debugMode = urlParams?.get('debug') === '1' || isDev;
            
            if (!debugMode) return null;
            
            return (
              <NewPlacesRefreshButton />
            );
          })()} */}
          
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
          {top5Places.map((place, index) => {
            // STEP 4: Resolve image per item (with enrichment support)
            const resolveImageSrc = (): { src: string; source: string } => {
              const enrichmentKey = getEnrichmentKey(place.id, place.name, place.city);
              const enriched = enrichedPlaces.get(enrichmentKey);
              
              // Priority 1: Enriched photo URL (from runtime enrichment)
              if (enriched?.photoUrl) {
                return { src: enriched.photoUrl, source: 'enriched_photo' };
              }
              
              // Priority 2: Seed photoName/photoReference (from offline enrichment)
              // photo_url can be:
              // - photoName: "places/{place_id}/photos/{photo_id}"
              // - photoReference: "CmRa..."
              // - URL: already a full URL
              if (place.photo_url) {
                // Check if it's a photoName (New API format)
                if (place.photo_url.startsWith('places/') || place.photo_url.includes('/photos/')) {
                  const proxyUrl = `${config.apiBaseUrl}/api/spend/place-photo?photoName=${encodeURIComponent(place.photo_url)}`;
                  return { src: proxyUrl, source: 'seed_photo_proxy' };
                }
                // Check if it's a photoReference (Legacy format - usually starts with "CmRa" or similar)
                if (place.photo_url.length > 20 && !place.photo_url.startsWith('http')) {
                  const proxyUrl = `${config.apiBaseUrl}/api/spend/place-photo?photoReference=${encodeURIComponent(place.photo_url)}`;
                  return { src: proxyUrl, source: 'seed_photo_proxy' };
                }
                // Otherwise it's already a URL, use directly
                if (place.photo_url.startsWith('http')) {
                  return { src: place.photo_url, source: 'seed_photo_url' };
                }
              }
              
              // Priority 4: Deterministic fallback based on item identity (NOT index)
              const itemIdentity = place.id || `${place.name}_${place.city}`;
              let hash = 0;
              for (let i = 0; i < itemIdentity.length; i++) {
                hash = ((hash << 5) - hash) + itemIdentity.charCodeAt(i);
                hash = hash & hash;
              }
              const seed = Math.abs(hash);
              
              const categoryImages: Record<string, string[]> = {
                '奶茶': [
                  'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1597484662343-072a73a3c0e1?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1600298881974-6be191ceeda1?w=400&h=300&fit=crop',
                ],
                '中餐': [
                  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1525755662776-9d797cd77072?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop',
                ],
                '夜宵': [
                  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&h=300&fit=crop',
                ],
                '新店打卡': [
                  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1552569973-6103e6a0a0e1?w=400&h=300&fit=crop',
                  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop',
                ],
              };
              const images = categoryImages[category] || categoryImages['中餐'];
              const fallbackSrc = images[seed % images.length];
              return { src: fallbackSrc, source: 'deterministic_fallback' };
            };
            
            const { src: photoUrl, source: imageSource } = resolveImageSrc();
            const isFallback = (place as any).isFallback;
            
            // Get enriched rating/userRatingCount if available
            // Priority: runtime enrichment > seed enriched data > fallback to 0
            const enrichmentKey = getEnrichmentKey(place.id, place.name, place.city);
            const enriched = enrichedPlaces.get(enrichmentKey);
            // Use runtime enriched data if available, otherwise use seed file enriched data (place.rating/user_ratings_total)
            const displayRating = enriched?.rating ?? (place.rating && place.rating > 0 ? place.rating : 0);
            const displayUserRatingCount = enriched?.userRatingCount ?? (place.user_ratings_total && place.user_ratings_total > 0 ? place.user_ratings_total : 0);
            
            // STEP 1: Hard debug logs per card (MANDATORY)
            const itemKey = place.id || `${place.name}|${place.city}`.toLowerCase().trim().replace(/\s+/g, '_');
            const photoIdentifier = enriched?.photoUrl ? 
              (enriched.photoUrl.includes('photo_reference=') ? 
                enriched.photoUrl.match(/photo_reference=([^&]+)/)?.[1] : 
                enriched.photoUrl.match(/photos\/([^/]+)/)?.[1]) : 
              null;
            
            if (import.meta.env.DEV || typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
              console.log(`[SpendCarousel] Card ${itemKey}:`, {
                itemKey,
                itemName: place.name,
                imageSrc: photoUrl,
                imageSource,
                photoIdentifier,
                reactKey: itemKey,
                hasPhotoUrl: !!place.photo_url,
                hasEnriched: !!enriched,
                enrichedPhotoUrl: enriched?.photoUrl,
                rating: {
                  fromRuntime: enriched?.rating,
                  fromSeed: place.rating,
                  display: displayRating,
                },
                userRatingCount: {
                  fromRuntime: enriched?.userRatingCount,
                  fromSeed: place.user_ratings_total,
                  display: displayUserRatingCount,
                },
              });
            }
            
            // STEP 3: Use stable, unique key (NOT index)
            const stableKey = `${itemKey}-${index}`;
            
            return (
              <CarouselItem key={stableKey} className="pl-2 basis-auto flex items-center">
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
                        // Fallback: if image fails, use category fallback (but log for debugging)
                        const target = e.target as HTMLImageElement;
                        const fallback = getFallbackImage();
                        if (target.src !== fallback) {
                          if (import.meta.env.DEV) {
                            console.warn(`[SpendCarousel] Image failed to load for ${place.name}, using category fallback:`, {
                              failedSrc: target.src,
                              fallbackSrc: fallback,
                            });
                          }
                          target.src = fallback;
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
                        <span className="tabular-nums">
                          {displayRating > 0 ? displayRating.toFixed(1) : '—'}
                        </span>
                        {displayUserRatingCount > 0 && (
                          <>
                            <span className="text-white/60">•</span>
                            <span className="tabular-nums text-[10px]">{displayUserRatingCount}</span>
                          </>
                        )}
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
                  {(() => {
                    // Resolve image for random place (same logic as normal places)
                    const resolveImageSrc = (): string => {
                      const enrichmentKey = getEnrichmentKey(revealedRandomPlace.id, revealedRandomPlace.name, revealedRandomPlace.city);
                      const enriched = enrichedPlaces.get(enrichmentKey);
                      
                      // Priority 1: Enriched photo URL
                      if (enriched?.photoUrl) {
                        return enriched.photoUrl;
                      }
                      
                      // Priority 2: Original photo_url
                      if (revealedRandomPlace.photo_url) {
                        return revealedRandomPlace.photo_url;
                      }
                      
                      // Priority 3: Deterministic fallback
                      const itemIdentity = revealedRandomPlace.id || `${revealedRandomPlace.name}_${revealedRandomPlace.city}`;
                      let hash = 0;
                      for (let i = 0; i < itemIdentity.length; i++) {
                        hash = ((hash << 5) - hash) + itemIdentity.charCodeAt(i);
                        hash = hash & hash;
                      }
                      const seed = Math.abs(hash);
                      
                      const categoryImages: Record<string, string[]> = {
                        '奶茶': [
                          'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=400&h=300&fit=crop',
                        ],
                        '中餐': [
                          'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1525755662776-9d797cd77072?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=400&h=300&fit=crop',
                        ],
                        '夜宵': [
                          'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=400&h=300&fit=crop',
                        ],
                        '新店打卡': [
                          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&h=300&fit=crop',
                          'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
                        ],
                      };
                      const images = categoryImages[category] || categoryImages['中餐'];
                      return images[seed % images.length];
                    };
                    const photoUrl = resolveImageSrc();
                    return (
                      <img
                        src={photoUrl}
                        alt={revealedRandomPlace.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== getFallbackImage()) {
                            target.src = getFallbackImage();
                          }
                        }}
                      />
                    );
                  })()}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 text-white z-10">
                    <h4 className="text-[13px] font-medium mb-0.5 truncate drop-shadow-lg leading-tight">{revealedRandomPlace.name}</h4>
                    <div className="flex items-baseline gap-1.5 text-[11px] opacity-70 drop-shadow-md font-mono font-normal">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                      {(() => {
                        const enrichmentKey = getEnrichmentKey(revealedRandomPlace.id, revealedRandomPlace.name, revealedRandomPlace.city);
                        const enriched = enrichedPlaces.get(enrichmentKey);
                        // Use runtime enriched data if available, otherwise use seed file enriched data
                        const displayRating = enriched?.rating ?? (revealedRandomPlace.rating && revealedRandomPlace.rating > 0 ? revealedRandomPlace.rating : 0);
                        const displayUserRatingCount = enriched?.userRatingCount ?? (revealedRandomPlace.user_ratings_total && revealedRandomPlace.user_ratings_total > 0 ? revealedRandomPlace.user_ratings_total : 0);
                        return (
                          <>
                            <span className="tabular-nums">
                              {displayRating > 0 ? displayRating.toFixed(1) : '—'}
                            </span>
                            {displayUserRatingCount > 0 && (
                              <>
                                <span className="text-white/60">•</span>
                                <span className="tabular-nums text-[10px]">{displayUserRatingCount}</span>
                              </>
                            )}
                          </>
                        );
                      })()}
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

/**
 * Manual refresh button for 新店打卡 (debug mode only)
 */
function NewPlacesRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{ ageDays?: number; poolSize?: number } | null>(null);

  // Load cache info on mount
  useEffect(() => {
    async function loadCacheInfo() {
      const pool = await getNewPlacesPool();
      if (pool) {
        setCacheInfo({
          ageDays: getCacheAgeDays(pool),
          poolSize: pool.items.length,
        });
      }
    }
    loadCacheInfo();
  }, [lastResult]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setLastResult(null);
    
    try {
      const result = await refreshNewPlaces();
      
      if (result.success) {
        setLastResult({
          success: true,
          message: `Refreshed: ${result.itemCount} places`,
        });
        
        // Reload page to show new data
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setLastResult({
          success: false,
          message: result.error || 'Refresh failed',
        });
      }
    } catch (error: any) {
      setLastResult({
        success: false,
        message: error.message || 'Unknown error',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="text-[10px] opacity-60 hover:opacity-100 transition-opacity font-mono font-normal px-1.5 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40 disabled:opacity-30"
        title="刷新新店打卡"
      >
        {refreshing ? '刷新中...' : '刷新新店打卡'}
      </button>
      {/* {cacheInfo && (
        <div className="text-[8px] font-mono opacity-40">
          {cacheInfo.ageDays !== undefined ? `${cacheInfo.ageDays}d` : 'N/A'} | {cacheInfo.poolSize || 0}
        </div>
      )} */}
      {lastResult && (
        <div className={`text-[8px] font-mono ${lastResult.success ? 'text-green-500' : 'text-red-500'}`}>
          {lastResult.message}
        </div>
      )}
    </div>
  );
}
