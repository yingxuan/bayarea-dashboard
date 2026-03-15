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

const FALLBACK_ITEMS: OfferItem[] = [
  {
    title: "一亩三分地求职版",
    url: "https://www.1point3acres.com/bbs/forum-52-1.html",
    sourceLabel: "一亩三分地",
    category: "job",
  },
];

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

  const visibleItems = items.length > 0 ? items : FALLBACK_ITEMS.slice(0, maxItems);

  return (
    <div className="editorial-card rounded-[1.15rem] p-4">
      <div className="editorial-list divide-y divide-border/20 rounded-[1rem] px-3 py-2">
        {visibleItems.map((item, idx) => (
          <a
            key={`${item.url}-${idx}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="group flex items-start gap-3 rounded-[0.9rem] px-3 py-3 transition-colors hover:bg-white/6"
          >
            <span className="mt-0.5 shrink-0 text-[10px] font-mono leading-tight text-sky-300/85">
              {categoryLabel[item.category]}
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
              {item.title}
            </span>
            <span className="mt-1 shrink-0 text-muted-foreground/55">
              <ExternalLink className="h-3.5 w-3.5" />
            </span>
            {item.publishedAt ? (
              <span className="shrink-0 text-[10px] font-mono text-muted-foreground/55">
                <TimeAgo isoString={item.publishedAt} />
              </span>
            ) : null}
          </a>
        ))}
      </div>
    </div>
  );
}
