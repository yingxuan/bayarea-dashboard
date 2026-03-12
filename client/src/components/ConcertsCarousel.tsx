import { Music } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";
import { useExternalLink } from "@/hooks/useExternalLink";

interface ConcertItem {
  id: string;
  name: string;
  url: string;
  image: string | null;
  venue: string | null;
  city: string | null;
  date: string;
  dateDisplay: string;
}

interface ConcertsCarouselProps {
  concerts: ConcertItem[];
  title?: string;
  emptyMessage?: string;
}

export default function ConcertsCarousel({
  concerts,
  title,
  emptyMessage,
}: ConcertsCarouselProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { handleExternalLinkClick } = useExternalLink();
  const sectionTitle = title ?? t.home.concerts;
  const items = concerts.slice(0, 8);

  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-border/35 bg-card/45 p-4 text-sm text-muted-foreground">
        {emptyMessage ?? t.home.concertsEmpty}
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border/35 bg-card/45 p-4">
      <div className="mb-4 border-b border-border/25 pb-3">
        <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-violet-300/75">
          <Music className="h-3.5 w-3.5" />
          Live
        </div>
        <h3 className="text-[15px] font-semibold text-foreground/92">{sectionTitle}</h3>
        <p className="mt-1 text-xs text-muted-foreground">如果今晚或这周末想出门，这里是更高信噪比的一组现场选择。</p>
      </div>

      <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full">
        <CarouselContent className="-ml-3">
          {items.map((concert) => (
            <CarouselItem key={concert.id} className="shrink-0 pl-3 basis-[80%] md:basis-[30%]">
              <a
                href={concert.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleExternalLinkClick}
                className="group block overflow-hidden rounded-sm border border-border/35 bg-background/55 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/75"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {concert.image ? (
                    <img
                      src={concert.image}
                      alt={concert.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground/35">
                      <Music className="h-8 w-8" />
                    </div>
                  )}
                  {concert.dateDisplay ? (
                    <div className="absolute right-3 top-3 rounded-sm bg-black/70 px-2 py-1 text-[10px] font-mono text-white">
                      {concert.dateDisplay}
                    </div>
                  ) : null}
                </div>
                <div className="p-3">
                  <div className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                    {concert.name}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-muted-foreground/72">
                    {concert.venue}
                    {concert.city ? ` · ${concert.city}` : ""}
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
