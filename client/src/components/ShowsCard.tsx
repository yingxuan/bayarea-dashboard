/**
 * Data Punk Design: Shows cards with vertical layout
 * - No carousel, simple vertical stack
 * - Poster images with consistent aspect ratio
 */

import { Star, ExternalLink } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";
import SourceLink from "@/components/SourceLink";

interface Show {
  id: string;
  title: string;
  description: string;
  poster: string;
  rating: number;
  platform: string;
  url: string;
}

interface ShowsCardProps {
  shows: Show[];
  maxItems?: number;
}

export default function ShowsCard({ shows, maxItems = 3 }: ShowsCardProps) {
  const displayShows = shows.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {displayShows.map((show) => (
        <a
          key={show.id}
          href={show.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-4 glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-all group"
        >
          {/* Poster */}
          <div className="flex-shrink-0 w-24 aspect-[2/3] bg-muted rounded overflow-hidden">
            <img
              src={show.poster}
              alt={show.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold mb-2 group-hover:text-primary transition-colors">
              {show.title}
            </h3>

            <p className="text-sm text-foreground/70 mb-3 line-clamp-2">
              {show.description}
            </p>

            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-mono font-semibold">{show.rating}</span>
              </div>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground font-mono">
                {show.platform}
              </span>
              <SourceLink
                name=""
                url={show.url}
                position="title-row"
                className="ml-auto"
              />
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
