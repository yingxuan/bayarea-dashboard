import { useMemo } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

interface MarketHighlightsProps {
  marketNews: any[];
  maxItems?: number;
  title?: string;
}

interface UnifiedItem {
  id: string;
  title: string;
  url: string;
  source: string;
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

export default function MarketHighlights({
  marketNews,
  maxItems = 8,
  title = "财经快讯",
}: MarketHighlightsProps) {
  const { handleExternalLinkClick } = useExternalLink();

  const allItems: UnifiedItem[] = useMemo(
    () =>
      (Array.isArray(marketNews) ? marketNews : [])
        .map((item: any, index: number) => ({
          id: `sina-${index}-${item.url ?? item.id ?? ""}-${item.title ?? index}`,
          title: item.title || item.title_zh || item.title_en || "新浪财经",
          url: item.url || "#",
          source: "新浪财经",
          publishedAt: item.publishedAt,
        }))
        .sort((a, b) => {
          const scoreDelta = scoreMarketHeadline(b.title) - scoreMarketHeadline(a.title);
          if (scoreDelta !== 0) return scoreDelta;
          return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
        })
        .slice(0, 8),
    [marketNews],
  );

  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/72">
        {title}
      </div>
      {allItems.length > 0 ? (
        <div className="divide-y divide-border/20">
          {allItems.slice(0, maxItems).map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group block py-3 first:pt-1 last:pb-1"
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-mono text-muted-foreground/58">
                <span>{item.source}</span>
                <span>{item.publishedAt ? <TimeAgo isoString={item.publishedAt} /> : ""}</span>
              </div>
              <div className="line-clamp-2 text-[14px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                {item.title}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-muted-foreground/60">暂无内容</div>
      )}
    </div>
  );
}
