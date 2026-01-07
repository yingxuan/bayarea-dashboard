/**
 * Market Highlights Component
 * Each item is a separate card with source label
 */

import { useEffect, useState } from "react";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";

interface CommunityItem {
  source: '1point3acres';
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt?: string;
}

interface MarketHighlightsProps {
  marketNews: any[]; // Top 3 中文美股新闻
}

interface UnifiedItem {
  id: string;
  title: string;
  url: string;
  source: string; // "新浪财经" or "一亩三分地"
  publishedAt?: string;
}

export default function MarketHighlights({ marketNews }: MarketHighlightsProps) {
  const [leekItems, setLeekItems] = useState<CommunityItem[]>([]);
  const { handleExternalLinkClick } = useExternalLink();

  // Fetch 一亩三分地 posts
  useEffect(() => {
    async function loadLeekPosts() {
      const apiUrl = `${config.apiBaseUrl}/api/community/leeks`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
    
      try {
        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
    
        // HTTP 不 ok → 直接 fallback
        if (!response.ok) {
          return;
        }
    
        const contentType = response.headers.get("content-type") || "";
    
        // ❗核心：非 JSON = 正常失败路径
        if (!contentType.includes("application/json")) {
          return;
        }
    
        const result = await response.json();
        const communityItems = result.items || [];
    
        if (communityItems.length > 0) {
          setLeekItems(communityItems.slice(0, 3));
        }
      } catch {
        // abort / network error → 静默失败
        return;
      }
    }
    loadLeekPosts();
    const interval = setInterval(loadLeekPosts, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Merge and format items
  const allItems: UnifiedItem[] = [
    ...marketNews.slice(0, 3).map((item: any, index: number) => ({
      id: `news-${index}-${item.url ?? item.id ?? ''}-${item.title ?? index}`,
      title: item.title || item.title_zh || item.title_en || 'Market News',
      url: item.url || '#',
      source: '新浪财经',
      publishedAt: item.publishedAt,
    })),
    ...leekItems.slice(0, 3).map((item, index) => ({
      id: `leek-${index}-${item.url ?? item.title ?? index}`,
      title: item.title,
      url: item.url,
      source: '一亩三分地',
      publishedAt: item.publishedAt,
    })),
  ];

  return (
    <div className="space-y-2">
      {allItems.length > 0 ? (
        allItems.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="block rounded-sm p-4 bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
          >
            <div className="flex items-start gap-2">
              <span className="text-[11px] text-muted-foreground/70 font-mono font-normal flex-shrink-0">
                {item.source}
              </span>
              <span className="text-[13px] font-normal font-mono text-foreground/90 group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-tight">
                {item.title}
              </span>
            </div>
          </a>
        ))
      ) : (
        <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md">
          <div className="text-xs opacity-60 font-mono font-normal text-center py-2">
            暂无内容
          </div>
        </div>
      )}
    </div>
  );
}
