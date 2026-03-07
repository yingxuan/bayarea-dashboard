import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
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

export default function FanwanCarousel({ videos }: Props) {
  const display = videos.slice(0, 18);

  if (display.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/30">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-mono font-medium text-amber-500/80">关于饭碗</h3>
          {display.length > 0 && (
            <span className="text-xs opacity-60 font-mono font-normal text-foreground/60">
              最近 14 天
            </span>
          )}
        </div>
      </div>

      {display.length > 0 ? (
        <div className="relative">
          <Carousel
            opts={{
              align: "start",
              loop: false,
              dragFree: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-3">
              {display.map((item) => (
                <CarouselItem
                  key={item.videoId}
                  className="pl-2 md:pl-3 snap-start shrink-0 w-[70%] md:w-[46%] min-w-0"
                >
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-lg overflow-hidden bg-card/50 border border-border/50 hover:border-amber-500/50 transition-all group"
                  >
                    <div className="relative w-full aspect-video bg-muted overflow-hidden">
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent space-y-0.5">
                        <h4 className="text-[13px] font-medium text-white line-clamp-1 leading-tight">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] opacity-80 text-white/80 font-mono font-normal">
                          <span>{item.channelTitle}</span>
                          <span>•</span>
                          <TimeAgo isoString={item.publishedAt} />
                          {item.durationSec ? (
                            <>
                              <span>•</span>
                              <span>{formatDuration(item.durationSec)}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </a>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      ) : (
        <div className="p-4 bg-card rounded-sm border border-border/40 shadow-md">
          <div className="text-xs opacity-60 font-mono font-normal text-center py-2">暂无更新</div>
        </div>
      )}
    </div>
  );
}

function formatDuration(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restM = (minutes % 60).toString().padStart(2, "0");
    return `${hours}:${restM}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}
