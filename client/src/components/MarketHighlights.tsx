import { useMemo } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

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
  const { handleExternalLinkClick } = useExternalLink();

  const allItems: UnifiedItem[] = useMemo(
    () =>
      (Array.isArray(marketNews) ? marketNews : []).slice(0, 8).map((item: any, index: number) => ({
        id: `sina-${index}-${item.url ?? item.id ?? ""}-${item.title ?? index}`,
        title: item.title || item.title_zh || item.title_en || "新浪财经",
        url: item.url || "#",
        source: "新浪财经",
        publishedAt: item.publishedAt,
      })),
    [marketNews],
  );

  return (
    <div className="editorial-list rounded-[1rem] px-3 py-3">
      {allItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {allItems.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="group rounded-[0.9rem] border border-border/25 bg-background/35 px-3 py-3 transition-colors hover:bg-white/6"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-mono text-muted-foreground/65">
              <span>{item.source}</span>
              <span>{item.publishedAt ? <TimeAgo isoString={item.publishedAt} /> : ""}</span>
            </div>
            <div className="line-clamp-2 text-[13px] leading-5 text-foreground/88 transition-colors group-hover:text-primary">
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
