import { Film } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
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
  if (movies.length === 0) return null;

  return (
    <div className="rounded-sm border border-border/35 bg-card/45 p-4">
      <div className="mb-4 border-b border-border/25 pb-3">
        <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-violet-300/75">
          <Film className="h-3.5 w-3.5" />
          Cinema
        </div>
        <h3 className="text-[15px] font-semibold text-foreground/92">{t.home.bayAreaMovies}</h3>
        <p className="mt-1 text-xs text-muted-foreground">影院里的华语片窗口不多，这里只保留还值得顺手去看的。</p>
      </div>

      <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full">
        <CarouselContent className="-ml-3">
          {movies.map((movie) => (
            <CarouselItem key={movie.id} className="shrink-0 pl-3 basis-[42%] md:basis-[20%]">
              <a
                href={movie.fandango_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-sm border border-border/35 bg-background/55 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/75"
              >
                <div className="relative h-[180px] overflow-hidden bg-muted md:h-[220px]">
                  {movie.poster_url ? (
                    <img
                      src={movie.poster_url}
                      alt={movie.original_title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/40">
                      <Film className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                    {movie.original_title}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-muted-foreground/72">
                    {movie.rating > 0 ? `★ ${movie.rating.toFixed(1)}` : "Now showing"}
                  </div>
                </div>
              </a>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
