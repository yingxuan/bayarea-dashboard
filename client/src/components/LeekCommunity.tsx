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

interface LeekCommunityResponse {
  items?: CommunityItem[];
  sourceMode?: "live" | "fallback" | "cache" | "unavailable";
  sourceName?: string;
  fallbackUsed?: boolean;
}

interface LeekCommunityProps {
  maxItems?: number;
  hideTitle?: boolean;
}

export default function LeekCommunity({ maxItems = 5, hideTitle = false }: LeekCommunityProps) {
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<LeekCommunityResponse | null>(null);

  useEffect(() => {
    async function loadLeekPosts() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/community/leeks`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`Leeks API returned ${response.status}`);
        }

        const result: LeekCommunityResponse = await response.json();
        setMeta(result);
        setItems((result.items || []).slice(0, maxItems));
      } catch (error) {
        console.error("[LeekCommunity] Failed to fetch leek posts:", error);
        setMeta({ sourceMode: "unavailable", sourceName: "unavailable", fallbackUsed: false });
        setItems([]);
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
  const sourceLine =
    meta?.sourceMode === "fallback"
      ? "备用抓取"
      : meta?.sourceMode === "cache"
        ? "缓存"
        : meta?.sourceMode === "live"
          ? "实时"
          : "";

  return (
    <div className={shellClass}>
      {!hideTitle ? (
        <div className="mb-4 border-b border-border/25 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-foreground/92">华人股市讨论</h3>
            {sourceLine ? (
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/65">
                {sourceLine}
              </span>
            ) : null}
          </div>
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
              className="group flex min-w-0 items-start justify-between gap-3 rounded-sm border border-border/25 bg-background/35 px-3 py-3 transition-all hover:border-primary/35 hover:bg-background/55"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-mono text-muted-foreground/65">{item.sourceLabel}</div>
                <span className="mt-1 block break-words text-[13px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                  {item.title}
                </span>
              </div>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/65 transition-colors group-hover:text-primary" />
            </a>
          ))
        ) : (
          <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-6 text-center text-sm text-muted-foreground">
            暂时没拿到社区帖子，稍后会自动重试。
          </div>
        )}
      </div>
    </div>
  );
}
