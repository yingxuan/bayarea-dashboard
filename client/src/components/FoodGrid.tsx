/**
 * Data Punk Design: Food grid with ratings and distance
 * - 4-column grid on desktop
 * - Consistent image aspect ratio
 * - Neon border on hover
 */

import { MapPin, Star, ExternalLink } from "lucide-react";
import SourceLink from "@/components/SourceLink";

interface FoodPlace {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  priceLevel: number;
  address: string;
  distance: number;
  photo: string;
  url: string;
  cuisine?: string;
}

interface FoodGridProps {
  places: FoodPlace[];
  maxItems?: number;
  showCuisine?: boolean;
}

export default function FoodGrid({
  places,
  maxItems = 4,
  showCuisine = false,
}: FoodGridProps) {
  const displayPlaces = places.slice(0, maxItems);

  const getPriceSymbol = (level: number) => {
    return "$".repeat(level);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayPlaces.map((place) => (
        <a
          key={place.id}
          href={place.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm overflow-hidden bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
        >
          {/* Photo */}
          <div className="relative aspect-[4/3] bg-muted overflow-hidden">
            <img
              src={place.photo}
              alt={place.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-mono flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span>{place.distance.toFixed(1)}mi</span>
            </div>
          </div>

          {/* Info */}
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-1">
              {place.name}
            </h3>

            {/* Rating and Price */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 text-xs">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="font-mono font-semibold">
                  {place.rating.toFixed(1)}
                </span>
                <span className="text-muted-foreground">
                  ({place.reviewCount})
                </span>
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {getPriceSymbol(place.priceLevel)}
              </div>
            </div>

            {/* Cuisine */}
            {showCuisine && place.cuisine && (
              <div className="mb-2">
                <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded font-mono">
                  {place.cuisine}
                </span>
              </div>
            )}

            {/* Address and Source */}
            <div className="flex items-start justify-between gap-1 text-xs text-muted-foreground">
              <span className="line-clamp-2 flex-1">{place.address}</span>
              <SourceLink
                name=""
                url={place.url}
                position="title-row"
                className="flex-shrink-0"
              />
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
