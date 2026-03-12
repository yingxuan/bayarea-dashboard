import { useEffect, useState } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import TimeAgo from "@/components/TimeAgo";
import SectionHeader from "@/components/SectionHeader";

interface JobItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

export default function LayoffsWidget() {
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`${config.apiBaseUrl}/api/community/jobs`, {
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const data = await resp.json();
          setItems(data.items || []);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 py-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/40" />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div>
      <SectionHeader title="裁员 & 找工" tone="market" />
      <div className="content-list divide-y divide-border/20 rounded-sm px-2 py-1">
        {items.slice(0, 5).map((item, idx) => (
          <a
            key={`${item.url}-${idx}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="group flex items-baseline gap-2 rounded-sm px-2 py-2.5 transition-colors hover:bg-muted/30"
          >
            <span className="shrink-0 text-[10px] font-mono leading-tight text-rose-400/85">
              {item.source}
            </span>
            <span className="min-w-0 flex-1 line-clamp-1 text-[13px] leading-tight text-foreground/88 transition-colors group-hover:text-primary">
              {item.title}
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
