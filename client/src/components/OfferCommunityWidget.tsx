import { useEffect, useState } from "react";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

interface OfferItem {
  title: string;
  url: string;
  sourceLabel: string;
  publishedAt?: string;
  category: "offer" | "interview" | "job";
}

interface OfferCommunityWidgetProps {
  maxItems?: number;
  embedded?: boolean;
}

const categoryLabel: Record<OfferItem["category"], string> = {
  offer: "Offer",
  interview: "面经",
  job: "找工",
};

export default function OfferCommunityWidget({
  maxItems = 5,
  embedded = false,
}: OfferCommunityWidgetProps) {
  const [items, setItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();

  useEffect(() => {
    async function loadOffers() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/community/offers`, {
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const result = await response.json();
          setItems((result.items || []).slice(0, maxItems));
        }
      } catch (error) {
        console.error("[OfferCommunityWidget] Failed to fetch 1P3A offer posts:", error);
      } finally {
        setLoading(false);
      }
    }

    loadOffers();
    const interval = setInterval(loadOffers, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [maxItems]);

  const shellClass = embedded
    ? "rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2"
    : "editorial-card min-w-0 rounded-[1.15rem] p-4";

  if (loading && items.length === 0) {
    return (
      <div className={shellClass}>
        <div className="space-y-2 py-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {items.length === 0 ? (
        <div className="px-1 py-3 text-sm text-muted-foreground">暂时没有抓到可用的帖子，稍后再刷。</div>
      ) : (
        <div className="min-w-0 divide-y divide-border/20">
          {items.map((item, idx) => (
            <a
              key={`${item.url}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group block py-3 first:pt-1 last:pb-1"
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-mono text-muted-foreground/58">
                <span className="text-sky-300/85">{categoryLabel[item.category]}</span>
                {item.publishedAt ? <TimeAgo isoString={item.publishedAt} /> : null}
              </div>
              <div className="break-words text-[14px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                {item.title}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
