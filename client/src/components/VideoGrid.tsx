/**
 * Data Punk Design: Video grid with hover glow effects
 * - Consistent aspect ratio for thumbnails
 * - Neon border on hover
 */

import { ExternalLink } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";
import SourceLink from "@/components/SourceLink";

interface Video {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
  url: string;
}

interface VideoGridProps {
  videos: Video[];
  maxItems?: number;
}

export default function VideoGrid({ videos, maxItems = 6 }: VideoGridProps) {
  const displayVideos = videos.slice(0, maxItems);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayVideos.map((video) => (
        <a
          key={video.id}
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm overflow-hidden bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
        >
          {/* Thumbnail */}
          <div className="relative aspect-video bg-muted overflow-hidden">
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-mono">
              视频
            </div>
          </div>

          {/* Info */}
          <div className="p-3 md:p-4">
            <h3 className="text-sm font-medium line-clamp-2 mb-2 group-hover:text-primary transition-colors">
              {video.title}
            </h3>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{video.channel}</span>
              <div className="flex items-center gap-1">
                <TimeAgo isoString={video.publishedAt} />
                <SourceLink
                  name=""
                  url={video.url}
                  position="title-row"
                />
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
