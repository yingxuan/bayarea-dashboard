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

function scoreMarketHeadline(title: string) {
  let score = 0;

  if (/(fed|fomc|cpi|pce|ppi|nonfarm|payroll|jobs report|treasury|yield|rate cut|interest rate|降息|加息|通胀|非农)/i.test(title)) {
    score += 8;
  }
  if (/(s&p|nasdaq|dow|美股|美债|华尔街|美联储|标普|纳指|道指)/i.test(title)) {
    score += 6;
  }
  if (/(nvidia|nvda|tesla|tsla|apple|aapl|microsoft|msft|meta|amazon|amzn|google|alphabet|amd|broadcom|avgo)/i.test(title)) {
    score += 5;
  }
  if (/(earnings|guidance|财报|业绩|营收|利润|指引|盘后|盘前)/i.test(title)) {
    score += 4;
  }
  if (/(tariff|关税|trump|biden|贸易|芯片|ai|人工智能)/i.test(title)) {
    score += 3;
  }
  if (/(市场快讯|收盘|午盘|早盘|刚刚|最新)/i.test(title)) {
    score -= 1;
  }

  return score;
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
        const nextItems = ((result.items || []) as NewsItem[])
          .map((item, index) => ({
            id: `sina-${index}-${item.id ?? item.url}`,
            title: item.title || item.title_zh || item.title_en || "新浪财经",
            url: item.url,
            publishedAt: item.publishedAt,
          }))
          .sort((a, b) => {
            const scoreDelta = scoreMarketHeadline(b.title) - scoreMarketHeadline(a.title);
            if (scoreDelta !== 0) return scoreDelta;
            return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
          })
          .slice(0, 8);
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
      <section className="section-shell section-shell-market rounded-sm p-3.5 md:p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded bg-muted" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell section-shell-market min-w-0 rounded-sm p-3.5 md:p-4">
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
              className={`group flex min-w-0 items-start gap-2 px-3 py-2.5 transition-colors hover:bg-card/60 sm:gap-3 sm:px-3.5 ${
                index !== items.length - 1 ? "border-b border-border/25" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start gap-2">
                  <h3 className="min-w-0 flex-1 break-words text-sm leading-5 text-foreground/92 transition-colors group-hover:text-primary sm:line-clamp-2">
                    {item.title}
                  </h3>
                  {item.publishedAt ? (
                    <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-muted-foreground/70">
                      <TimeAgo isoString={item.publishedAt} />
                    </div>
                  ) : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
