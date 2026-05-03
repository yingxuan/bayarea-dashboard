import { useEffect, useMemo, useState } from "react";
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

export const HOME_LAYOFF_PREVIEW_COUNT = 5;
const NON_WORD_CHARS = /[^a-z0-9\s]/gi;

function normalizeLayoffTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(layoffs?|laid off|job cuts?|cuts jobs?|workforce reduction|downsizing)\b/g, "layoff")
    .replace(NON_WORD_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompanyName(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b([A-Z][A-Za-z0-9&.+-]*(?:\s+[A-Z][A-Za-z0-9&.+-]*){0,2})\b(?=\s+(?:layoffs?|lays off|laid off|job cuts?|cuts jobs?|restructures?|to cut))/,
    /\b([A-Z][A-Za-z0-9&.+-]*(?:\s+[A-Z][A-Za-z0-9&.+-]*){0,2})\b(?=\s*:\s*layoffs?)/,
    /\b([A-Z][A-Za-z0-9&.+-]*(?:\s+[A-Z][A-Za-z0-9&.+-]*){0,2})\b(?=\s+(?:employees?|staff|workers)\b)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (
      candidate &&
      !/^(More|Breaking|Report|Latest|Most|Many|Several|Why|How|The)$/i.test(candidate) &&
      !/\b(people|workers|employees|company|tech|market)\b/i.test(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

export function dedupeLayoffItems(items: JobItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const company = extractCompanyName(item.title);
    const dateKey = item.publishedAt ? item.publishedAt.slice(0, 10) : "na";
    const normalizedTitle = normalizeLayoffTitle(item.title).slice(0, 80);
    const dedupeKey = company ? `${company.toLowerCase()}|${dateKey}` : `${normalizedTitle}|${dateKey}`;

    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
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
          setItems(dedupeLayoffItems(layoffItems));
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

  const visibleItems = useMemo(() => items.slice(0, HOME_LAYOFF_PREVIEW_COUNT), [items]);

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
      {visibleItems.length === 0 ? (
        <div className="px-1 py-3 text-sm text-muted-foreground">暂无新增裁员信息，稍后刷新。</div>
      ) : (
        <div className="min-w-0 divide-y divide-border/20">
          {visibleItems.map((item, idx) => {
            const company = extractCompanyName(item.title);

            return (
              <a
                key={`${item.url}-${idx}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleExternalLinkClick}
                className="group block py-3 first:pt-1 last:pb-1"
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-mono text-muted-foreground/58">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-rose-300/85">{item.source}</span>
                    {company ? (
                      <span className="rounded-full border border-rose-400/30 bg-rose-500/12 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                        {company}
                      </span>
                    ) : null}
                  </div>
                  {item.publishedAt ? <TimeAgo isoString={item.publishedAt} /> : null}
                </div>
                <div className="break-words text-[14px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                  {item.title}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
