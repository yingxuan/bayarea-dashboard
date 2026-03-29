import { useEffect, useState } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import TimeAgo from "@/components/TimeAgo";

interface JobItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  category?: "layoff" | "hiring" | "discussion";
}

interface LayoffsWidgetProps {
  embedded?: boolean;
}

export default function LayoffsWidget({ embedded = false }: LayoffsWidgetProps) {
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
          const layoffItems = (data.items || []).filter((item: JobItem) => item.category === "layoff");
          setItems(layoffItems);
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

  const shellClass = embedded
    ? "rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2"
    : "editorial-card min-w-0 rounded-[1.15rem] p-4";

  if (loading) {
    return (
      <div className={shellClass}>
        <div className="space-y-2 py-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {items.length === 0 ? (
        <div className="px-1 py-3 text-sm text-muted-foreground">暂无新增裁员信息，稍后刷新。</div>
      ) : (
        <div className="min-w-0 divide-y divide-border/20">
          {items.slice(0, 5).map((item, idx) => (
            <a
              key={`${item.url}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group block py-3 first:pt-1 last:pb-1"
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-mono text-muted-foreground/58">
                <span className="text-rose-300/85">{item.source}</span>
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
