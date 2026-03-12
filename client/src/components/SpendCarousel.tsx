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

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapPin, Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { refreshNewPlaces, getNewPlacesPool } from "@/hooks/usePlacesCache";
import { getCacheAgeDays, clearAllPools } from "@/lib/places/localCache";
import { enrichPlace, getEnrichmentStats } from "@/lib/places/placeEnricher";
import { getEnrichmentKey, getEnriched } from "@/lib/places/enrichmentCache";
import { config } from "@/config";

declare global {
  interface Window {
    __clearPlacesCache?: () => Promise<void>;
    __placesDebug?: {
      enable: () => void;
      disable: () => void;
      clearPools: () => Promise<void>;
    };
  }
}

interface SpendPlace {
  id: string;
  name: string;
  category: string;
  rating: number;
  user_ratings_total: number;
  distance_miles?: number;
  photo_url?: string;
  photo_local_url?: string;
  maps_url: string;
  city: string;
  badges?: string[];
}

interface PlacesDebugInfo {
  region?: string;
  tiersUsed?: number;
  excludedSamples?: Array<{ name: string; reason: string; types?: string[] }>;
  includedBreakdown?: Record<string, any>;
}

interface SpendCarouselProps {
  category: string;
  places: SpendPlace[];
  fallbackImage?: string;
  offset?: number; // Current display offset (for "换一批" functionality)
  onRefresh?: () => void; // Callback for "换一批" button
  debugInfo?: PlacesDebugInfo;
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

const CLEAR_CACHE_ENDPOINT = "/api/dev/places/clear-cache";

export default function SpendCarousel({ category, places, fallbackImage, offset = 0, onRefresh, debugInfo }: SpendCarouselProps) {
  const isDevMode = import.meta.env.DEV;
  const devAdminToken = import.meta.env.VITE_DEV_ADMIN_TOKEN;
  const devCacheEnabled = isDevMode || Boolean(devAdminToken);
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const debugPlaces = urlParams?.get("debugPlaces") === "1" || (typeof window !== "undefined" && localStorage.getItem("places_debug") === "1") || isDevMode;
  const [showDebug, setShowDebug] = useState(false);

  const clearPlacesCache = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (devAdminToken) {
        headers["x-dev-admin-token"] = devAdminToken;
      }
      const response = await fetch(CLEAR_CACHE_ENDPOINT, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await response.json();
      await clearAllPools();
      window.location.reload();
    } catch (error) {
      console.error("[SpendCarousel] failed to clear places cache:", error);
      throw error;
    }
  }, [devAdminToken]);

  const handleClearCacheClick = useCallback(async () => {
    try {
      await clearPlacesCache();
    } catch (error) {
      console.error("[SpendCarousel] failed to clear places cache:", error);
    }
  }, [clearPlacesCache]);

  useEffect(() => {
    if (devCacheEnabled && typeof window !== "undefined") {
      window.__clearPlacesCache = handleClearCacheClick;
      window.__placesDebug = {
        enable: () => localStorage.setItem("places_debug", "1"),
        disable: () => localStorage.removeItem("places_debug"),
        clearPools: async () => {
          await clearAllPools();
          window.location.reload();
        },
      };
    }
  }, [devCacheEnabled, handleClearCacheClick]);

  // Get fallback image for this category
  const getFallbackImage = () => fallbackImage || CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['中餐'];

  // State for random place selection
  const [isRolling, setIsRolling] = useState(false);
  const [revealedRandomPlace, setRevealedRandomPlace] = useState<SpendPlace | null>(null);
  const [lastPickedId, setLastPickedId] = useState<string | null>(null);
  
  // State for enriched places (rating, photo from Places API)
  const [enrichedPlaces, setEnrichedPlaces] = useState<Map<string, { rating: number; userRatingCount: number; photoUrl?: string }>>(new Map());
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  const inflightPhotos = useRef<Set<string>>(new Set());

  // Debug logging
  console.log(`[SpendCarousel] Category: "${category}", Places count: ${places.length}, Offset: ${offset}`);
  if (places.length > 0) {
    console.log(`[SpendCarousel] First place:`, places[0]);
  }

  const windowSize = 10;

  // For 新店打卡: show all available places (no minimum requirement)
  // For other categories: select a window of places starting from offset (for "换一批" functionality)
  const topPlaces = useMemo(() => {
    let result: SpendPlace[] = [];
    
    // STEP 5: For 夜宵, show all places (no opening hours filter)
    // Opening hours filter has been removed - all 夜宵 places from seed file are shown
    if (category === '夜宵') {
      // Show all places without filtering by opening hours
      const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
      
      if (places.length <= windowSize) {
        result = places;
      } else if (normalizedOffset + windowSize <= places.length) {
        result = places.slice(normalizedOffset, normalizedOffset + windowSize);
      } else {
        const fromEnd = places.slice(normalizedOffset);
        const fromStart = places.slice(0, windowSize - fromEnd.length);
        result = [...fromEnd, ...fromStart];
      }
      
      if (import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')) {
        console.log(`[SpendCarousel] 夜宵: Showing ${result.length} places (no opening hours filter applied)`);
      }
      
      return result;
    }
    
    // STEP 7: For 新店打卡, filter using seed file enriched data (rating, userRatingCount)
    if (category === '新店打卡') {
      const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
      if (places.length <= windowSize) {
        return places;
      }
      if (normalizedOffset + windowSize <= places.length) {
        return places.slice(normalizedOffset, normalizedOffset + windowSize);
      }
      const fromEnd = places.slice(normalizedOffset);
      const fromStart = places.slice(0, windowSize - fromEnd.length);
      return [...fromEnd, ...fromStart];
    }
    
    // Other categories: normal rotation
    const normalizedOffset = Math.max(0, Math.min(offset, places.length - 1));
    
    if (places.length <= windowSize) {
      result = places;
    } else if (normalizedOffset + windowSize <= places.length) {
      // Normal case: we have enough places from current offset
      result = places.slice(normalizedOffset, normalizedOffset + windowSize);
    } else {
      // Wrap around: take remaining from current offset + take from start
      const fromEnd = places.slice(normalizedOffset);
      const fromStart = places.slice(0, windowSize - fromEnd.length);
      result = [...fromEnd, ...fromStart];
    }
    
    return result;
  }, [places, offset, category, enrichedPlaces, windowSize]);

  // On-demand photo fetch (first show) for places missing local photo
  useEffect(() => {
    topPlaces.forEach((p) => {
      if (!p.id) return;
      if (p.photo_local_url || photoOverrides[p.id]) return;
      const key = p.id;
      if (inflightPhotos.current.has(key)) return;
      inflightPhotos.current.add(key);

      const url = `${config.apiBaseUrl}/api/spend/place-photo?place_id=${encodeURIComponent(key)}`;
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.photo_local_url) {
            setPhotoOverrides((prev) => ({
              ...prev,
              [key]: data.photo_local_url,
            }));
          }
        })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => inflightPhotos.current.delete(key), 1000);
        });
    });
  }, [topPlaces, photoOverrides]);

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
          // For "新店打卡", check if first review is within 6 months
          if (category === '新店打卡' && enriched.earliestReviewDate) {
            const reviewDate = new Date(enriched.earliestReviewDate);
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            if (reviewDate < sixMonthsAgo) {
              // Too old, skip this cached enrichment
              continue;
            }
          }

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
              // For "新店打卡", check if first review is within 6 months
              if (category === '新店打卡' && enriched.earliestReviewDate) {
                const reviewDate = new Date(enriched.earliestReviewDate);
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                if (reviewDate < sixMonthsAgo) {
                  // Too old, don't include in enriched places
                  return;
                }
              }

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

  // Random pool: use all available curated places (not just the visible window)
  const randomPool = places;

  const isCompactPlaceholder = category !== '新店打卡' && places.length < 5;
  const isNewPlacesEmpty = category === '新店打卡' && places.length === 0;

  if (isCompactPlaceholder || isNewPlacesEmpty) {
    const message =
      isCompactPlaceholder && places.length > 0 ? '数据不足' :
      isNewPlacesEmpty ? '暂无推荐' :
      '暂无推荐';
    return (
      <div className="rounded-sm border border-border/45 bg-card/70 p-4 flex flex-col min-h-[150px]">
        <div className="mb-2 flex-shrink-0 flex items-center justify-between">
          <h3 className="text-[24px] md:text-[28px] font-semibold text-foreground">
            {category}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <p className="text-xs font-mono text-muted-foreground/70 text-center line-clamp-2">
            {message}
          </p>
        </div>
      </div>
    );
  }

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
    <div className="rounded-sm border border-border/45 bg-card/70 p-4 flex flex-col h-auto min-h-0">
      {/* Category Header - Top-left with Refresh Button */}
      <div className="mb-3 flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-2">Dining</div>
          <h3 className="text-[15px] font-semibold text-foreground/90">{category}</h3>
        </div>
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
          {(devCacheEnabled || debugPlaces) && (
            <button
              onClick={handleClearCacheClick}
              className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal px-2 py-0.5 rounded hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/60"
              title="Clear Places Cache"
            >
              Clear Places Cache
            </button>
          )}
          {debugPlaces && (
            <button
              onClick={() => setShowDebug((prev) => !prev)}
              className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal px-2 py-0.5 rounded hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
              title="Why this place"
            >
              Why?
            </button>
          )}
        </div>
      </div>
      <div className="mb-3 h-px bg-gradient-to-r from-transparent via-border/80 to-transparent" />

      {/* Horizontal Carousel - up to 10 curated places + optional random */}
      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full min-w-0 relative"
      >
        <CarouselContent className="-ml-2 min-w-0 items-stretch">
          {/* Curated places */}
          {topPlaces.map((place, index) => {
            // STEP 4: Resolve image per item (with enrichment support)
            const resolveImageSrc = (): { src: string; source: string } => {
              const enrichmentKey = getEnrichmentKey(place.id, place.name, place.city);
              const enriched = enrichedPlaces.get(enrichmentKey);
              
              const overrideLocal = photoOverrides[place.id];
              if (overrideLocal) {
                return { src: overrideLocal, source: 'local_photo_cached' };
              }

              // Priority 1: Local cached photo (never call Google Photos at runtime)
              const localPhoto = place.photo_local_url || (place.photo_url?.startsWith('/') ? place.photo_url : undefined);
              if (localPhoto) {
                return { src: localPhoto, source: 'local_photo' };
              }

              // Priority 2: Enriched photo URL only if it is already a local/static path
              if (enriched?.photoUrl && enriched.photoUrl.startsWith('/')) {
                return { src: enriched.photoUrl, source: 'local_enriched_photo' };
              }
              
              // Priority 3: Deterministic fallback based on item identity (NOT index)
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

            // Derived 推荐理由 badge for regular (non-new-places) cards
            // Always computed for 奶茶/中餐/夜宵 — overrides English musthave tags
            const isNewCategory = category === '新店打卡';
            let derivedBadge: string | null = null;
            if (!isNewCategory) {
              if (displayRating > 0 && displayUserRatingCount >= 50) {
                if (displayUserRatingCount >= 1000) {
                  derivedBadge = "超人气";
                } else if (displayRating >= 4.6 && displayUserRatingCount >= 200) {
                  derivedBadge = "高分人气";
                } else if (displayRating >= 4.3) {
                  derivedBadge = "好评";
                }
              }
            }

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
                  className="block w-44 rounded-sm overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 hover:-translate-y-0.5 transition-all group hover:shadow-[0_16px_32px_rgba(0,0,0,0.22)]"
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
                      {((isNewCategory && place.badges && place.badges.length > 0) || (!isNewCategory && derivedBadge)) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {isNewCategory && place.badges && place.badges.length > 0 ? (
                            place.badges.map((badge) => (
                              <span
                                key={badge}
                                className="text-[9px] font-mono uppercase tracking-[0.08em] bg-white/10 border border-white/20 text-white/80 rounded px-1 py-0.5"
                              >
                                {badge}
                              </span>
                            ))
                          ) : derivedBadge ? (
                            <span
                              key={derivedBadge}
                              className="text-[9px] font-mono uppercase tracking-[0.08em] bg-white/10 border border-white/20 text-white/80 rounded px-1 py-0.5"
                            >
                              {derivedBadge}
                            </span>
                          ) : null}
                        </div>
                      )}
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
                className="block w-44 rounded-sm overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 hover:-translate-y-0.5 transition-all group hover:shadow-[0_16px_32px_rgba(0,0,0,0.22)]"
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
                className="block w-44 rounded-sm bg-card/50 border border-border/50 hover:border-primary/50 hover:-translate-y-0.5 transition-all group hover:shadow-[0_16px_32px_rgba(0,0,0,0.22)] disabled:opacity-50 disabled:cursor-not-allowed"
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
      {debugPlaces && showDebug && (
        <div className="mt-3 border border-border/50 rounded-sm bg-card/70 p-3 text-[11px] font-mono text-foreground/80 max-h-80 overflow-auto">
          <div className="font-semibold mb-2">Debug: {category} (region: {debugInfo?.region || "n/a"})</div>
          {places.map((place) => {
            const breakdown = debugInfo?.includedBreakdown?.[place.id];
            return (
              <div key={place.id} className="mb-3 border-b border-border/30 pb-2 last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{place.name}</span>
                  <span className="text-xs opacity-70">score: {breakdown?.score ?? (place as any).score ?? 'n/a'}</span>
                </div>
                {place.badges && place.badges.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {place.badges.map((b) => (
                      <span key={b} className="text-[10px] px-1 py-0.5 rounded bg-white/10 border border-white/20 text-white/80">
                        {b}
                      </span>
                    ))}
                  </div>
                )}
                {breakdown && (
                  <div className="mt-1 space-y-1 text-[10px]">
                    <div>popularity: {breakdown.popularity?.toFixed?.(2) ?? breakdown.popularity}</div>
                    {breakdown.priors?.length ? <div>priors: {breakdown.priors.join(", ")}</div> : null}
                    {breakdown.penalties?.length ? <div>penalties: {breakdown.penalties.join(", ")}</div> : null}
                    {breakdown.positiveSignals?.length ? <div>signals: {breakdown.positiveSignals.join(", ")}</div> : null}
                    <div>tier: {breakdown.tier ?? "?"}</div>
                  </div>
                )}
              </div>
            );
          })}
          {debugInfo?.excludedSamples?.length ? (
            <div className="mt-2">
              <div className="font-semibold">Excluded samples</div>
              <ul className="list-disc list-inside text-[10px] opacity-80">
                {debugInfo.excludedSamples.slice(0, 10).map((ex, idx) => (
                  <li key={`${ex.name}-${idx}`}>
                    {ex.name} – {ex.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
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
