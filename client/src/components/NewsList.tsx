/**
 * Data Punk Design: News list with relevance scores
 * - Monospace font for metadata
 * - Neon accent for high relevance scores
 */

import { ExternalLink, Zap } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  summary_zh: string;
  why_it_matters_zh: string;
  source: string;
  url: string;
  publishedAt: string;
  relevanceScore: number;
  tags?: string[];
}

interface NewsListProps {
  news: NewsItem[];
  maxItems?: number;
  showTags?: boolean;
}

export default function NewsList({
  news,
  maxItems = 5,
  showTags = false,
}: NewsListProps) {
  const displayNews = news.slice(0, maxItems);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}天前`;
  };

  return (
    <div className="space-y-4">
      {displayNews.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-all group"
        >
          <div className="flex items-start justify-between gap-4 mb-2">
            <h3 className="text-base font-semibold group-hover:text-primary transition-colors flex-1">
              {item.title}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Relevance Score */}
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono ${
                  item.relevanceScore >= 90
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>{item.relevanceScore}</span>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm text-foreground/80 mb-2">{item.summary_zh}</p>

          {/* Why it matters */}
          <div className="bg-muted/30 border-l-2 border-primary/50 pl-3 py-2 mb-3">
            <p className="text-sm text-primary/90">
              <span className="font-semibold">为什么重要：</span>
              {item.why_it_matters_zh}
            </p>
          </div>

          {/* Tags */}
          {showTags && item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs font-mono bg-secondary text-secondary-foreground rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span>{item.source}</span>
            <span>•</span>
            <span>{formatTimeAgo(item.publishedAt)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
