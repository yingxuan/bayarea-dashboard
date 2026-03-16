import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
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
}

const categoryLabel: Record<OfferItem["category"], string> = {
  offer: "Offer",
  interview: "面经",
  job: "找工",
};

export default function OfferCommunityWidget({ maxItems = 5 }: OfferCommunityWidgetProps) {
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

  if (loading && items.length === 0) {
    return (
      <div className="editorial-card rounded-[1.15rem] p-4">
        <div className="space-y-2 py-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="editorial-card min-w-0 rounded-[1.15rem] p-4">
      {items.length === 0 ? (
        <div className="rounded-[0.95rem] border border-border/25 bg-background/35 px-3 py-4 text-sm text-muted-foreground">
          暂时没有抓到可用的帖子，稍后再刷。
        </div>
      ) : (
        <div className="editorial-list min-w-0 divide-y divide-border/20 rounded-[1rem] px-1 py-1 sm:px-3 sm:py-2">
          {items.map((item, idx) => (
            <a
              key={`${item.url}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group grid min-w-0 grid-cols-[auto,minmax(0,1fr),auto] items-start gap-x-2 gap-y-1 rounded-[0.9rem] px-2 py-2.5 transition-colors hover:bg-white/6 sm:flex sm:items-start sm:gap-3 sm:px-3 sm:py-3"
            >
              <span className="mt-0.5 shrink-0 text-[10px] font-mono leading-tight text-sky-300/85">
                {categoryLabel[item.category]}
              </span>
              <span className="min-w-0 break-words pr-1 text-[13px] leading-5 text-foreground/88 transition-colors group-hover:text-primary sm:flex-1 sm:pr-0 sm:leading-6">
                {item.title}
              </span>
              <div className="flex items-center justify-end gap-2 sm:mt-1 sm:shrink-0">
                <span className="text-muted-foreground/55">
                  <ExternalLink className="h-3.5 w-3.5" />
                </span>
                {item.publishedAt ? (
                  <span className="hidden text-[10px] font-mono text-muted-foreground/55 sm:inline">
                    <TimeAgo isoString={item.publishedAt} />
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
