/**
 * Market Highlights Component
 * Each item is a separate card with source label
 * Shows: 新浪财经 news + 一亩三分地 leeks + HN top stories
 */

import { useEffect, useState } from "react";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

interface CommunityItem {
  source: '1point3acres';
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt?: string;
}

interface HNItem {
  id: number;
  title: string;
  url: string;
  score: number;
}

interface MarketHighlightsProps {
  marketNews: any[]; // Top 3 中文美股新闻
}

interface UnifiedItem {
  id: string;
  title: string;
  url: string;
  source: string; // "新浪财经" or "一亩三分地" or "HN"
  publishedAt?: string;
}

export default function MarketHighlights({ marketNews }: MarketHighlightsProps) {
  const [leekItems, setLeekItems] = useState<CommunityItem[]>([]);
  const [hnItems, setHnItems] = useState<HNItem[]>([]);
  const { handleExternalLinkClick } = useExternalLink();

  // Fetch 一亩三分地 posts and HN stories in parallel
  useEffect(() => {
    async function loadData() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const [leeksResp, hnResp] = await Promise.allSettled([
          fetch(`${config.apiBaseUrl}/api/community/leeks`, { signal: controller.signal }),
          fetch(`${config.apiBaseUrl}/api/hn`, { signal: controller.signal }),
        ]);
        clearTimeout(timeoutId);

        if (leeksResp.status === 'fulfilled' && leeksResp.value.ok) {
          const ct = leeksResp.value.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const result = await leeksResp.value.json();
            const items = result.items || [];
            if (items.length > 0) setLeekItems(items.slice(0, 3));
          }
        }

        if (hnResp.status === 'fulfilled' && hnResp.value.ok) {
          const result = await hnResp.value.json();
          if (result.items?.length > 0) setHnItems(result.items.slice(0, 3));
        }
      } catch {
        clearTimeout(timeoutId);
      }
    }
    loadData();
    const interval = setInterval(loadData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Merge and format items: 新浪财经 + 一亩三分地 + HN (interleaved)
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
      source: item.sourceLabel || '一亩三分地',
      publishedAt: item.publishedAt,
    })),
    ...hnItems.slice(0, 3).map((item, index) => ({
      id: `hn-${index}-${item.id}`,
      title: item.title,
      url: item.url,
      source: 'HN',
    })),
  ];

  return (
    <div className="divide-y divide-border/20">
      {allItems.length > 0 ? (
        allItems.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="flex items-baseline gap-3 py-2 px-1.5 hover:bg-muted/30 rounded-sm transition-colors group"
          >
            <span className="text-[11px] text-muted-foreground/55 font-mono shrink-0">
              {item.source}
              {item.publishedAt && (
                <> · <TimeAgo isoString={item.publishedAt} /></>
              )}
            </span>
            <span className="text-[12px] font-mono text-foreground/85 group-hover:text-primary transition-colors line-clamp-1 leading-tight min-w-0">
              {item.title}
            </span>
          </a>
        ))
      ) : (
        <div className="py-3 text-xs opacity-50 font-mono text-center">
          暂无内容
        </div>
      )}
    </div>
  );
}
