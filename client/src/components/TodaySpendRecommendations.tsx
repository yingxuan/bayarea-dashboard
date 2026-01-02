/**
 * Today Spend Recommendations Component
 * Displays food recommendations (奶茶/中餐/咖啡/夜宵) for "吃喝玩乐"
 * 
 * Requirements:
 * - Always shows 6 items
 * - Never shows "暂无推荐"
 * - Format: "今天可以去 · 奶茶" / "TP Tea – Cupertino" / "⭐ 4.4 · 1.3 miles"
 */

import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { config } from "@/config";
import SourceLink from "@/components/SourceLink";

interface FoodPlace {
  id: string;
  name: string;
  category: string; // 奶茶/中餐/咖啡/夜宵
  rating: number;
  user_ratings_total: number; // New field from Google Places API
  review_count?: number; // Legacy field for backward compatibility
  address: string;
  distance_miles?: number; // Optional, may not be available from Google Places
  photo_url?: string; // Optional
  maps_url: string; // New field from Google Places API
  url?: string; // Legacy field for backward compatibility
  city: string; // Cupertino / Sunnyvale / San Jose
  score?: number; // Optional
}

interface TodaySpendRecommendationsProps {
  maxItems?: number;
}

export default function TodaySpendRecommendations({ maxItems = 6 }: TodaySpendRecommendationsProps) {
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecommendations() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/spend/today`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const result = await response.json();
          const items = result.items || [];
          // Always ensure we have items (fallback to empty array if needed, but this should never happen)
          setPlaces(items.slice(0, maxItems));
        } else {
          console.error(`[TodaySpendRecommendations] API error: ${response.status} ${response.statusText}`);
          // Don't set empty array - keep previous data if available
        }
      } catch (error) {
        console.error("[TodaySpendRecommendations] Failed to fetch recommendations:", error);
        // Don't set empty array - keep previous data if available
      } finally {
        setLoading(false);
      }
    }
    
    loadRecommendations();
    // Refresh every 30 minutes (cache is 24h, but refresh UI periodically)
    const interval = setInterval(loadRecommendations, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [maxItems]);

  // Group places by category for display
  const groupedByCategory = places.reduce((acc, place) => {
    const category = place.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(place);
    return acc;
  }, {} as Record<string, FoodPlace[]>);

  if (loading && places.length === 0) {
    return (
      <div className="glow-border rounded-sm p-4 bg-card">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If no places, don't show "暂无推荐" - just show empty state silently
  // But this should never happen due to fallback mechanism
  if (places.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {Object.entries(groupedByCategory).map(([category, categoryPlaces]) => (
        <div key={category} className="glow-border rounded-sm p-4 bg-card">
          {/* Category Header - 文案模板："今天可以去 · 奶茶" */}
          <div className="mb-3">
            <h3 className="text-base font-semibold font-mono text-foreground/90">
              今天可以去 · {category}
            </h3>
          </div>

          {/* Places List */}
          <div className="space-y-3">
            {categoryPlaces.map((place) => {
              // Support both new (maps_url) and legacy (url) fields
              const placeUrl = place.maps_url || place.url || '#';
              // Support both new (user_ratings_total) and legacy (review_count) fields
              const reviewCount = place.user_ratings_total || place.review_count || 0;
              // Distance may not be available from Google Places
              const distance = place.distance_miles;
              
              return (
                <a
                  key={place.id}
                  href={placeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 rounded-sm bg-card/50 border border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Name and City - 文案模板："TP Tea – Cupertino" */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold group-hover:text-primary transition-colors line-clamp-1">
                          {place.name}
                        </h4>
                        <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                          – {place.city}
                        </span>
                      </div>
                      
                      {/* Rating and Distance - 文案模板："⭐ 4.4 · 1.3 miles" */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span className="flex items-center gap-1">
                          <span className="text-yellow-400">⭐</span>
                          <span>{place.rating.toFixed(1)}</span>
                        </span>
                        {distance !== undefined && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{distance.toFixed(1)} miles</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: External Link */}
                    <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
