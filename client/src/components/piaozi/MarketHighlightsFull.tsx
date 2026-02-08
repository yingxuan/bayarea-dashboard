/**
 * Market Highlights Full Component (Extended News View)
 * Displays more market news with:
 * - More news items (up to 20)
 * - Source filtering
 * - Pagination support
 */

import { useEffect, useState, useMemo } from "react";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

interface NewsItem {
  id?: string;
  title: string;
  title_zh?: string;
  title_en?: string;
  url: string;
  source?: string;
  publishedAt?: string;
}

interface CommunityItem {
  source: '1point3acres';
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt?: string;
}

interface UnifiedItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

type SourceFilter = 'all' | 'sina' | '1point3acres';

export default function MarketHighlightsFull() {
  const [marketNews, setMarketNews] = useState<NewsItem[]>([]);
  const [leekItems, setLeekItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const { handleExternalLinkClick } = useExternalLink();

  // Fetch market news
  useEffect(() => {
    async function loadMarketNews() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/market-news`;
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();
          const newsItems = result.items || [];
          setMarketNews(newsItems.slice(0, 20)); // Up to 20 items
        }
      } catch (error) {
        console.error("[MarketHighlightsFull] Failed to fetch market news:", error);
      }
    }

    async function loadLeekPosts() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/community/leeks`;
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const result = await response.json();
            const communityItems = result.items || [];
            setLeekItems(communityItems.slice(0, 10)); // Up to 10 items
          }
        }
      } catch (error) {
        console.error("[MarketHighlightsFull] Failed to fetch leek posts:", error);
      }
    }

    Promise.all([loadMarketNews(), loadLeekPosts()]).finally(() => {
      setLoading(false);
    });

    const interval = setInterval(() => {
      loadMarketNews();
      loadLeekPosts();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Merge and format items
  const allItems: UnifiedItem[] = useMemo(() => {
    const sinaItems = marketNews.map((item, index) => ({
      id: `news-${index}-${item.url ?? item.id ?? ''}-${item.title ?? index}`,
      title: item.title || item.title_zh || item.title_en || 'Market News',
      url: item.url || '#',
      source: 'sina' as const,
      publishedAt: item.publishedAt,
    }));

    const leekMapped = leekItems.map((item, index) => ({
      id: `leek-${index}-${item.url ?? item.title ?? index}`,
      title: item.title,
      url: item.url,
      source: '1point3acres' as const,
      publishedAt: item.publishedAt,
    }));

    return [...sinaItems, ...leekMapped];
  }, [marketNews, leekItems]);

  // Filter items by source
  const filteredItems = useMemo(() => {
    if (sourceFilter === 'all') return allItems;
    if (sourceFilter === 'sina') return allItems.filter(item => item.source === 'sina');
    if (sourceFilter === '1point3acres') return allItems.filter(item => item.source === '1point3acres');
    return allItems;
  }, [allItems, sourceFilter]);

  // Source counts
  const sourceCounts = useMemo(() => ({
    all: allItems.length,
    sina: allItems.filter(item => item.source === 'sina').length,
    '1point3acres': allItems.filter(item => item.source === '1point3acres').length,
  }), [allItems]);

  const getSourceLabel = (source: string) => {
    if (source === 'sina') return '新浪财经';
    if (source === '1point3acres') return '一亩三分地';
    return source;
  };

  if (loading) {
    return (
      <div className="bg-card rounded-sm shadow-md border border-border/40 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-muted rounded w-1/4"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-sm shadow-md border border-border/40">
      {/* Header with Filter */}
      <div className="p-4 border-b border-border/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h2 className="text-lg font-mono font-medium text-foreground">市场看点</h2>

          {/* Source Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">来源:</span>
            <div className="flex gap-1">
              {(['all', 'sina', '1point3acres'] as SourceFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSourceFilter(filter)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                    sourceFilter === filter
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {filter === 'all' ? '全部' : getSourceLabel(filter)}
                  <span className="ml-1 opacity-70">({sourceCounts[filter]})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* News List */}
      <div className="p-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-mono">
            暂无内容
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleExternalLinkClick}
                className="block rounded-sm p-4 bg-card/50 border border-border/30 hover:bg-card/80 hover:border-border/50 transition-all group"
              >
                <div className="flex items-start gap-3">
                  {/* Source Badge */}
                  <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-mono bg-muted/50 rounded text-muted-foreground">
                    {getSourceLabel(item.source)}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13px] font-normal font-mono text-foreground/90 group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                      {item.title}
                    </h4>
                    {item.publishedAt && (
                      <div className="mt-1.5">
                        <TimeAgo isoString={item.publishedAt} />
                      </div>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
