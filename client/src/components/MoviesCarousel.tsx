/**
 * MoviesCarousel Component
 * Portrait poster carousel for Chinese-language movies in US theaters (院线华语)
 */

import { Film } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface Movie {
  id: number;
  title: string;
  original_title: string;
  poster_url: string;
  rating: number;
  release_date: string;
  fandango_url: string;
}

interface MoviesCarouselProps {
  movies: Movie[];
}

export default function MoviesCarousel({ movies }: MoviesCarouselProps) {
  const { lang } = useLanguage();
  const t = useT(lang);

  if (movies.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1.5 mb-1.5 border-b border-border/30">
        <Film className="w-3.5 h-3.5 text-foreground/60" />
        <h3 className="text-[13px] font-mono font-medium text-foreground/70">
          {t.home.bayAreaMovies}
        </h3>
      </div>

      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2">
          {movies.map((movie) => (
            <CarouselItem
              key={movie.id}
              className="pl-2 basis-[22%] md:basis-[11%] shrink-0"
            >
              <a
                href={movie.fandango_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-sm overflow-hidden bg-card border border-border/40 shadow-md hover:opacity-80 transition-opacity group"
              >
                {/* Fixed-height poster */}
                <div className="relative w-full h-[120px] md:h-[155px] bg-muted overflow-hidden">
                  {movie.poster_url ? (
                    <img
                      src={movie.poster_url}
                      alt={movie.original_title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                      <Film className="w-5 h-5" />
                    </div>
                  )}
                </div>
                {/* Title + rating */}
                <div className="px-1 py-0.5">
                  <p className="text-[10px] font-medium text-foreground/80 line-clamp-1 leading-tight">
                    {movie.original_title}
                  </p>
                  {movie.rating > 0 && (
                    <p className="text-[9px] font-mono text-foreground/45 tabular-nums">
                      ⭐ {movie.rating.toFixed(1)}
                    </p>
                  )}
                </div>
              </a>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
