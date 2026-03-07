/**
 * Layoffs & Career Widget
 * Shows recent layoff/career posts from Reddit r/layoffs and r/cscareerquestions
 */

import { useEffect, useState } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import TimeAgo from "@/components/TimeAgo";

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
          <div key={i} className="h-6 animate-pulse bg-muted/40 rounded-sm" />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-border/20">
      {items.slice(0, 5).map((item, idx) => (
        <a
          key={`${item.url}-${idx}`}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalLinkClick}
          className="flex items-baseline gap-2 py-2 px-1.5 hover:bg-muted/30 rounded-sm transition-colors group"
        >
          <span className="shrink-0 text-[10px] font-mono text-rose-400/80 leading-tight">
            {item.source}
          </span>
          <span className="text-[12px] font-mono text-foreground/85 group-hover:text-primary transition-colors line-clamp-1 leading-tight min-w-0 flex-1">
            {item.title}
          </span>
          {item.publishedAt && (
            <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono">
              <TimeAgo isoString={item.publishedAt} />
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
