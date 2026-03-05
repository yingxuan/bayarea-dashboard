/**
 * ConcertsCarousel Component
 * Horizontal carousel for upcoming Bay Area Chinese concerts (湾区演唱会)
 */

import { Music } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import SectionHeader from "@/components/SectionHeader";
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

export default function ConcertsCarousel({ concerts, title, emptyMessage }: ConcertsCarouselProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const sectionTitle = title ?? t.home.concerts;
  const sectionEmpty = emptyMessage ?? t.home.concertsEmpty;
  const { handleExternalLinkClick } = useExternalLink();

  const items = concerts.slice(0, 8);

  if (items.length === 0) {
    return (
      <div className="w-full">
        <SectionHeader title={sectionTitle} />
        <p className="text-[12px] text-muted-foreground/50 font-mono py-2">
          {sectionEmpty}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <SectionHeader title={sectionTitle} />

      <Carousel
        opts={{
          align: "start",
          loop: false,
          dragFree: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-3">
          {items.map((concert) => (
            <CarouselItem
              key={concert.id}
              className="pl-2 md:pl-3 basis-[80%] md:basis-[28%] shrink-0"
            >
              <a
                href={concert.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleExternalLinkClick}
                className="block rounded-sm overflow-hidden bg-card border border-border/40 shadow-md hover:opacity-80 transition-opacity group"
              >
                {/* 16:9 image */}
                <div className="relative w-full aspect-video bg-muted overflow-hidden">
                  {concert.image ? (
                    <img
                      src={concert.image}
                      alt={concert.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  {/* Fallback icon */}
                  <div className={`absolute inset-0 flex items-center justify-center text-muted-foreground/30 ${concert.image ? 'hidden' : ''}`}>
                    <Music className="w-8 h-8" />
                  </div>

                  {/* Date badge - top right */}
                  {concert.dateDisplay && (
                    <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-sm leading-tight">
                      {concert.dateDisplay}
                    </div>
                  )}

                  {/* Bottom gradient overlay */}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-[12px] font-medium text-white line-clamp-1 leading-tight">
                      {concert.name}
                    </p>
                    {concert.venue && (
                      <p className="text-[10px] text-white/60 font-mono line-clamp-1 leading-tight mt-0.5">
                        {concert.venue}{concert.city ? ` · ${concert.city}` : ''}
                      </p>
                    )}
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
