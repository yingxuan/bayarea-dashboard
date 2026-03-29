import { useEffect, useState } from "react";
import { config } from "@/config";
import { useExternalLink } from "@/hooks/useExternalLink";
import TimeAgo from "@/components/TimeAgo";

interface StartupNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

interface StartupNewsListProps {
  maxItems?: number;
  title?: string;
}

export default function StartupNewsList({
  maxItems = 6,
  title = "湾区 Startup",
}: StartupNewsListProps) {
  const [items, setItems] = useState<StartupNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`${config.apiBaseUrl}/api/market?handler=startup-news`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) throw new Error(`startup news ${resp.status}`);
        const data = await resp.json();
        setItems((data.items || []).slice(0, maxItems));
      } catch (error) {
        console.error("[StartupNewsList] Failed to fetch startup news:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [maxItems]);

  return (
    <section className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/72">
        {title}
      </div>

      {loading ? (
        <div className="space-y-2 py-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/40" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="divide-y divide-border/20">
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
                <span>{item.source}</span>
                <span>{item.publishedAt ? <TimeAgo isoString={item.publishedAt} /> : ""}</span>
              </div>
              <div className="line-clamp-2 break-words text-[14px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                {item.title}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="py-3 text-sm text-muted-foreground">暂时没有抓到可用的创业新闻。</div>
      )}
    </section>
  );
}
