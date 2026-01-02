/**
 * Data Punk Design: Judgment-based news list
 * - Chinese summary as primary content (friend-reminder tone)
 * - English title hidden/secondary
 * - "Why it matters" prominently displayed
 */

import { ExternalLink, Zap } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";
import SourceLink from "@/components/SourceLink";

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

  return (
    <div className="space-y-3">
      {displayNews.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-all group"
        >
          <div className="flex items-start justify-between gap-4 mb-3">
            {/* Chinese Summary - PRIMARY CONTENT */}
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors flex-1 leading-relaxed">
              {item.summary_zh}
            </h3>
            
            {/* Relevance Score */}
            <div className="flex items-center gap-2 flex-shrink-0">
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

          {/* Why it matters - PROMINENT (only if available) */}
          {item.why_it_matters_zh && item.why_it_matters_zh.trim() !== '' && (
            <div className="bg-primary/5 border-l-2 border-primary pl-3 py-2 mb-3">
              <p className="text-sm text-foreground/90 leading-relaxed">
                <span className="font-semibold text-primary">💡 为什么重要：</span>
                {item.why_it_matters_zh}
              </p>
            </div>
          )}

          {/* Tags and Metadata */}
          <div className="flex items-center justify-between gap-4">
            {/* Tags */}
            {showTags && item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.tags.slice(0, 2).map((tag) => (
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono ml-auto">
              <SourceLink
                name={item.source}
                url={item.url}
                position="title-row"
                className="text-muted-foreground hover:text-blue-400"
              />
              {item.publishedAt && (
                <>
                  <span>•</span>
                  <TimeAgo isoString={item.publishedAt} />
                </>
              )}
            </div>
          </div>

          {/* English Title - HIDDEN by default, shown on hover */}
          <div className="mt-2 text-xs text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.title}
          </div>
        </a>
      ))}
    </div>
  );
}
