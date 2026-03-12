import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { config } from "@/config";

interface CommunityItem {
  source: "1point3acres";
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt?: string;
}

interface LeekCommunityProps {
  maxItems?: number;
  hideTitle?: boolean;
}

export default function LeekCommunity({ maxItems = 5, hideTitle = false }: LeekCommunityProps) {
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLeekPosts() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/community/leeks`, {
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const result = await response.json();
          setItems((result.items || []).slice(0, maxItems));
        }
      } catch (error) {
        console.error("[LeekCommunity] Failed to fetch leek posts:", error);
      } finally {
        setLoading(false);
      }
    }

    loadLeekPosts();
    const interval = setInterval(loadLeekPosts, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [maxItems]);

  if (loading && items.length === 0) {
    return (
      <div className="grid gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-sm bg-muted/40" />
        ))}
      </div>
    );
  }

  const shellClass = hideTitle ? "" : "rounded-sm border border-border/35 bg-card/45 p-4";

  return (
    <div className={shellClass}>
      {!hideTitle ? (
        <div className="mb-4 border-b border-border/25 pb-3">
          <div className="eyebrow mb-2">Community Threads</div>
          <h3 className="text-[15px] font-semibold text-foreground/92">一亩三分地</h3>
          <p className="mt-1 text-xs text-muted-foreground">更长、更细的讨论串，适合真的准备行动时深看。</p>
        </div>
      ) : null}

      <div className="space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <a
              key={`${item.url}-${index}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-3 rounded-sm border border-border/25 bg-background/35 px-3 py-3 transition-all hover:border-primary/35 hover:bg-background/55"
            >
              <span className="min-w-0 flex-1 text-[13px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                {item.title}
              </span>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/65 transition-colors group-hover:text-primary" />
            </a>
          ))
        ) : (
          <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-6 text-center text-sm text-muted-foreground">
            社区帖子暂时不可用，稍后再试。
          </div>
        )}
      </div>
    </div>
  );
}
