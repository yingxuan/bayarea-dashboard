import { useEffect, useState } from "react";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

interface CommunityItem {
  source: "1point3acres";
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
  marketNews: any[];
}

interface UnifiedItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

export default function MarketHighlights({ marketNews }: MarketHighlightsProps) {
  const [leekItems, setLeekItems] = useState<CommunityItem[]>([]);
  const [hnItems, setHnItems] = useState<HNItem[]>([]);
  const { handleExternalLinkClick } = useExternalLink();

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

        if (leeksResp.status === "fulfilled" && leeksResp.value.ok) {
          const ct = leeksResp.value.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const result = await leeksResp.value.json();
            const items = result.items || [];
            if (items.length > 0) setLeekItems(items.slice(0, 3));
          }
        }

        if (hnResp.status === "fulfilled" && hnResp.value.ok) {
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

  const allItems: UnifiedItem[] = [
    ...marketNews.slice(0, 3).map((item: any, index: number) => ({
      id: `news-${index}-${item.url ?? item.id ?? ""}-${item.title ?? index}`,
      title: item.title || item.title_zh || item.title_en || "Market News",
      url: item.url || "#",
      source: "新浪财经",
      publishedAt: item.publishedAt,
    })),
    ...leekItems.slice(0, 3).map((item, index) => ({
      id: `leek-${index}-${item.url ?? item.title ?? index}`,
      title: item.title,
      url: item.url,
      source: item.sourceLabel || "一亩三分地",
      publishedAt: item.publishedAt,
    })),
    ...hnItems.slice(0, 3).map((item, index) => ({
      id: `hn-${index}-${item.id}`,
      title: item.title,
      url: item.url,
      source: "HN",
    })),
  ];

  return (
    <div className="editorial-list divide-y divide-border/20 rounded-[1rem] px-3 py-2">
      {allItems.length > 0 ? (
        allItems.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="group flex items-start gap-3 rounded-[0.9rem] px-3 py-3 transition-colors hover:bg-white/6"
          >
            <span
              className={`mt-0.5 shrink-0 text-[11px] font-mono ${
                item.source === "HN" ? "text-orange-400/70" : "text-muted-foreground/65"
              }`}
            >
              {item.source}
              {item.publishedAt && (
                <>
                  {" "}
                  · <TimeAgo isoString={item.publishedAt} />
                </>
              )}
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
              {item.title}
            </span>
          </a>
        ))
      ) : (
        <div className="py-4 text-center text-xs text-muted-foreground/60">暂无内容</div>
      )}
    </div>
  );
}
