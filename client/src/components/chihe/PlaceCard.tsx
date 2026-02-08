/**
 * PlaceCard Component
 * Unified card for displaying restaurant/place information
 * Used across all category views in the Chihe page
 *
 * Features:
 * - Large image with gradient overlay
 * - Rating, review count, distance display
 * - Direct Google Maps link
 * - Data Punk styling
 */

import { Star, MapPin, ExternalLink } from "lucide-react";

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
  address?: string;
}

interface PlaceCardProps {
  place: SpendPlace;
  size?: 'small' | 'medium' | 'large';
  showCategory?: boolean;
}

// Category fallback images
const CATEGORY_FALLBACK_IMAGES: Record<string, string[]> = {
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

function getImageUrl(place: SpendPlace): string {
  // Priority 1: Local cached photo
  if (place.photo_local_url) {
    return place.photo_local_url;
  }

  // Priority 2: Photo URL that starts with /
  if (place.photo_url?.startsWith('/')) {
    return place.photo_url;
  }

  // Priority 3: Deterministic fallback based on place identity
  const itemIdentity = place.id || `${place.name}_${place.city}`;
  let hash = 0;
  for (let i = 0; i < itemIdentity.length; i++) {
    hash = ((hash << 5) - hash) + itemIdentity.charCodeAt(i);
    hash = hash & hash;
  }
  const seed = Math.abs(hash);

  const images = CATEGORY_FALLBACK_IMAGES[place.category] || CATEGORY_FALLBACK_IMAGES['中餐'];
  return images[seed % images.length];
}

export default function PlaceCard({ place, size = 'medium', showCategory = false }: PlaceCardProps) {
  const imageUrl = getImageUrl(place);

  // Size-based classes
  const sizeClasses = {
    small: {
      container: 'w-full',
      image: 'h-32',
      name: 'text-[13px]',
      meta: 'text-[10px]',
    },
    medium: {
      container: 'w-full',
      image: 'h-40',
      name: 'text-[14px]',
      meta: 'text-[11px]',
    },
    large: {
      container: 'w-full',
      image: 'h-48',
      name: 'text-[15px]',
      meta: 'text-[12px]',
    },
  };

  const classes = sizeClasses[size];

  return (
    <a
      href={place.maps_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block ${classes.container} rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-primary/50 transition-all group`}
    >
      {/* Image with overlay */}
      <div className={`relative w-full ${classes.image} bg-muted overflow-hidden`}>
        <img
          src={imageUrl}
          alt={place.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            const fallback = CATEGORY_FALLBACK_IMAGES['中餐'][0];
            if (target.src !== fallback) {
              target.src = fallback;
            }
          }}
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white z-10">
          {/* Category badge */}
          {showCategory && (
            <span className="inline-block text-[9px] font-mono uppercase tracking-wider bg-primary/30 border border-primary/50 text-primary-foreground rounded px-1.5 py-0.5 mb-1.5">
              {place.category}
            </span>
          )}

          {/* Name */}
          <h4 className={`${classes.name} font-medium mb-1 truncate drop-shadow-lg leading-tight`}>
            {place.name}
          </h4>

          {/* Rating and distance */}
          <div className={`flex items-center gap-2 ${classes.meta} opacity-90 drop-shadow-md font-mono font-normal`}>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
              <span className="tabular-nums">
                {place.rating > 0 ? place.rating.toFixed(1) : '-'}
              </span>
              {place.user_ratings_total > 0 && (
                <span className="text-white/60">({place.user_ratings_total})</span>
              )}
            </div>

            {place.distance_miles !== undefined && (
              <>
                <span className="text-white/40">|</span>
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="tabular-nums">{place.distance_miles.toFixed(1)} mi</span>
                </div>
              </>
            )}

            <span className="text-white/40">|</span>
            <span className="truncate">{place.city}</span>
          </div>

          {/* Badges */}
          {place.badges && place.badges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {place.badges.slice(0, 3).map((badge) => (
                <span
                  key={badge}
                  className="text-[9px] font-mono uppercase tracking-[0.08em] bg-white/10 border border-white/20 text-white/80 rounded px-1 py-0.5"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Hover: Google Maps icon */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-black/60 rounded-full p-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    </a>
  );
}
