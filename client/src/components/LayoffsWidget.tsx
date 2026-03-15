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

  if (loading) {
    return (
      <div className="editorial-card rounded-[1.15rem] p-4">
        <div className="space-y-2 py-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-sm bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="editorial-card rounded-[1.15rem] p-4">
      {items.length === 0 ? (
        <div className="rounded-[0.95rem] border border-border/25 bg-background/35 px-3 py-4 text-sm text-muted-foreground">
          暂无新增裁员信息，稍后刷新。
        </div>
      ) : (
        <div className="editorial-list divide-y divide-border/20 rounded-[1rem] px-3 py-2">
          {items.slice(0, 5).map((item, idx) => (
            <a
              key={`${item.url}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group flex items-start gap-3 rounded-[0.9rem] px-3 py-3 transition-colors hover:bg-white/6"
            >
              <span className="mt-0.5 shrink-0 text-[10px] font-mono leading-tight text-rose-400/85">
                {item.source}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
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
      )}
    </div>
  );
}
