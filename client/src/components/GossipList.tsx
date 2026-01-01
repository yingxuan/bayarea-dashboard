/**
 * Data Punk Design: Gossip list with hot scores
 * - Vertical text list without images
 * - Monospace font for metadata
 * - Flame icon for hot posts
 */

import { MessageCircle, Eye, ExternalLink, Flame } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";
import SourceLink from "@/components/SourceLink";

interface GossipPost {
  id: string;
  title: string;
  excerpt: string;
  replyCount: number;
  viewCount: number;
  url: string;
  publishedAt: string;
  hotScore: number;
}

interface GossipListProps {
  posts: GossipPost[];
  maxItems?: number;
}

export default function GossipList({ posts, maxItems = 10 }: GossipListProps) {
  const displayPosts = posts.slice(0, maxItems);

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
    <div className="space-y-3">
      {displayPosts.map((post, index) => (
        <a
          key={post.id}
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-all group"
        >
          <div className="flex items-start gap-3">
            {/* Index */}
            <div
              className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-bold font-mono ${
                index < 3
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {index + 1}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold group-hover:text-primary transition-colors line-clamp-1 flex-1">
                  {post.title}
                </h3>
                {post.hotScore >= 80 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-mono flex-shrink-0">
                    <Flame className="w-3 h-3" />
                    <span>{post.hotScore}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-foreground/70 mb-2 line-clamp-1">
                {post.excerpt}
              </p>

              <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  <span>{formatNumber(post.replyCount)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>{formatNumber(post.viewCount)}</span>
                </div>
                <span>•</span>
                <TimeAgo isoString={post.publishedAt} />
                <SourceLink
                  name=""
                  url={post.url}
                  position="title-row"
                  className="ml-auto"
                />
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
