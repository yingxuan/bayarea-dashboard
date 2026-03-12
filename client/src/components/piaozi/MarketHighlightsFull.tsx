import { useEffect, useMemo, useState } from "react";
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
  source: "1point3acres";
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

type SourceFilter = "all" | "sina" | "1point3acres";

export default function MarketHighlightsFull() {
  const [marketNews, setMarketNews] = useState<NewsItem[]>([]);
  const [leekItems, setLeekItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const { handleExternalLinkClick } = useExternalLink();

  useEffect(() => {
    async function loadMarketNews() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/market-news`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();
          setMarketNews((result.items || []).slice(0, 20));
        }
      } catch (error) {
        console.error("[MarketHighlightsFull] Failed to fetch market news:", error);
      }
    }

    async function loadLeekPosts() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/community/leeks`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const result = await response.json();
            setLeekItems((result.items || []).slice(0, 10));
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

  const allItems: UnifiedItem[] = useMemo(() => {
    const sinaItems = marketNews.map((item, index) => ({
      id: `news-${index}-${item.url ?? item.id ?? ""}-${item.title ?? index}`,
      title: item.title || item.title_zh || item.title_en || "Market News",
      url: item.url || "#",
      source: "sina" as const,
      publishedAt: item.publishedAt,
    }));

    const leekMapped = leekItems.map((item, index) => ({
      id: `leek-${index}-${item.url ?? item.title ?? index}`,
      title: item.title,
      url: item.url,
      source: "1point3acres" as const,
      publishedAt: item.publishedAt,
    }));

    return [...sinaItems, ...leekMapped];
  }, [marketNews, leekItems]);

  const filteredItems = useMemo(() => {
    if (sourceFilter === "all") return allItems;
    if (sourceFilter === "sina") return allItems.filter((item) => item.source === "sina");
    if (sourceFilter === "1point3acres") {
      return allItems.filter((item) => item.source === "1point3acres");
    }
    return allItems;
  }, [allItems, sourceFilter]);

  const sourceCounts = useMemo(
    () => ({
      all: allItems.length,
      sina: allItems.filter((item) => item.source === "sina").length,
      "1point3acres": allItems.filter((item) => item.source === "1point3acres").length,
    }),
    [allItems],
  );

  const getSourceLabel = (source: string) => {
    if (source === "sina") return "新浪财经";
    if (source === "1point3acres") return "一亩三分地";
    return source;
  };

  if (loading) {
    return (
      <div className="section-shell section-shell-market rounded-sm p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-1/4 rounded bg-muted" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-shell section-shell-market rounded-sm">
      <div className="border-b border-border/30 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="eyebrow mb-2">Market Briefing</div>
            <h2 className="text-xl font-semibold text-cyan-300/90">市场看点</h2>
            <p className="mt-1 text-sm text-muted-foreground/72">
              新闻不求多，重点看哪些线索真的会影响今天的判断。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "sina", "1point3acres"] as SourceFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setSourceFilter(filter)}
                className={`rounded-sm px-3 py-1.5 text-xs font-mono transition-colors ${
                  sourceFilter === filter
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/45 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {filter === "all" ? "全部" : getSourceLabel(filter)}
                <span className="ml-1 opacity-70">({sourceCounts[filter]})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5">
        {filteredItems.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">暂无内容</div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleExternalLinkClick}
                className="group block rounded-sm border border-border/35 bg-card/45 p-4 transition-all hover:border-primary/45 hover:bg-card/70"
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 rounded-sm bg-muted/45 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {getSourceLabel(item.source)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 text-[14px] leading-6 text-foreground/92 transition-colors group-hover:text-primary">
                      {item.title}
                    </h4>
                    {item.publishedAt && (
                      <div className="mt-2 text-[11px] font-mono text-muted-foreground/65">
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
