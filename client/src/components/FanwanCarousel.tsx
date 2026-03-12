import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import TimeAgo from "@/components/TimeAgo";

type FanwanVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
  durationSec?: number | null;
};

interface Props {
  videos: FanwanVideo[];
}

function formatDuration(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = (minutes % 60).toString().padStart(2, "0");
    return `${hours}:${restMinutes}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export default function FanwanCarousel({ videos }: Props) {
  const display = videos.slice(0, 12);
  if (display.length === 0) return null;

  return (
    <div className="rounded-sm border border-border/35 bg-card/45 p-4">
      <div className="mb-4 border-b border-border/25 pb-3">
        <div className="eyebrow mb-2">Career Watch</div>
        <h3 className="text-[15px] font-semibold text-foreground/92">关于饭碗</h3>
        <p className="mt-1 text-xs text-muted-foreground">最近 14 天的职业频道内容，适合判断讨论温度。</p>
      </div>

      <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full">
        <CarouselContent className="-ml-3">
          {display.map((item) => (
            <CarouselItem key={item.videoId} className="min-w-0 shrink-0 pl-3 md:basis-1/2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-sm border border-border/35 bg-background/55 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/75 hover:shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute left-3 top-3 rounded-sm border border-white/15 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/78">
                    {item.channelTitle}
                  </div>
                  {item.durationSec ? (
                    <div className="absolute bottom-3 right-3 rounded-sm bg-black/70 px-2 py-1 text-[10px] font-mono text-white">
                      {formatDuration(item.durationSec)}
                    </div>
                  ) : null}
                </div>
                <div className="p-3">
                  <h4 className="line-clamp-2 text-sm font-medium leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                    {item.title}
                  </h4>
                  <div className="mt-3 text-[11px] font-mono text-muted-foreground/72">
                    <TimeAgo isoString={item.publishedAt} />
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
