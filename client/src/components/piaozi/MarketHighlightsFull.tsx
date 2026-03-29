import { useEffect, useState } from "react";
import TimeAgo from "@/components/TimeAgo";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";

interface NewsItem {
  id?: string;
  title: string;
  title_zh?: string;
  title_en?: string;
  url: string;
  publishedAt?: string;
}

interface UnifiedItem {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
}

export default function MarketHighlightsFull() {
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();

  useEffect(() => {
    const loadMarketNews = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/market-news`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        const nextItems = ((result.items || []) as NewsItem[]).slice(0, 8).map((item, index) => ({
          id: `sina-${index}-${item.id ?? item.url}`,
          title: item.title || item.title_zh || item.title_en || "新浪财经",
          url: item.url,
          publishedAt: item.publishedAt,
        }));
        setItems(nextItems);
      } catch (error) {
        console.error("[MarketHighlightsFull] Failed to fetch market news:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMarketNews();
    const interval = setInterval(loadMarketNews, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <section className="section-shell section-shell-market rounded-sm p-4 md:p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded bg-muted" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell section-shell-market min-w-0 rounded-sm p-4 md:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-cyan-300/90">新浪财经</h2>
        <span className="text-[11px] font-mono text-muted-foreground/70">{items.length} 条</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-sm border border-border/35 bg-card/35 px-4 py-8 text-center text-sm text-muted-foreground">
          暂无内容
        </div>
      ) : (
        <div className="min-w-0 rounded-sm border border-border/35 bg-card/35">
          {items.map((item, index) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className={`group flex min-w-0 flex-col gap-1.5 px-3 py-3 transition-colors hover:bg-card/60 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-4 ${
                index !== items.length - 1 ? "border-b border-border/25" : ""
              }`}
            >
              <h3 className="min-w-0 flex-1 break-words text-sm leading-6 text-foreground/92 transition-colors group-hover:text-primary sm:line-clamp-2">
                {item.title}
              </h3>
              {item.publishedAt ? (
                <div className="shrink-0 text-[11px] font-mono text-muted-foreground/65 sm:pt-0.5">
                  <TimeAgo isoString={item.publishedAt} />
                </div>
              ) : null}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
