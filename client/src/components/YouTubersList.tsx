/**
 * Data Punk Design: YouTubers list with video thumbnails
 * - Vertical list with thumbnails
 * - Monospace font for metadata
 * - Shows "暂无更新" for unavailable channels
 */

import { ExternalLink } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";

interface YouTuberItem {
  channelName: string;
  title: string;
  url: string;
  publishedAt: string;
  thumbnail: string;
  status: 'ok' | 'unavailable';
}

interface YouTubersListProps {
  items: YouTuberItem[];
  maxItems?: number;
}

export default function YouTubersList({ items, maxItems = 10 }: YouTubersListProps) {
  // Filter out unavailable items (they don't take up space)
  const availableItems = items.filter(item => item.status === 'ok');
  const displayItems = availableItems.slice(0, maxItems);

  if (displayItems.length === 0) {
    return (
      <div className="glow-border rounded-sm p-4 bg-card">
        <div className="text-sm text-muted-foreground font-mono">
          暂无更新
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayItems.map((item, index) => (
        <a
          key={`${item.channelName}-${index}`}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block glow-border rounded-sm p-3 bg-card hover:bg-card/80 transition-all group"
        >
          <div className="flex items-start gap-3">
            {/* Thumbnail */}
            <div className="flex-shrink-0 w-24 h-16 rounded overflow-hidden bg-muted">
              <img
                src={item.thumbnail}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold group-hover:text-primary transition-colors line-clamp-2 flex-1">
                  {item.title}
                </h3>
                <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <span className="text-foreground/70">{item.channelName}</span>
                <span>•</span>
                <TimeAgo isoString={item.publishedAt} />
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
