import { useEffect, useMemo, useState } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface GossipItem {
  title: string;
  url: string;
  meta?: {
    source: "1point3acres" | "v2ex" | "reddit";
    publishedAt?: string;
  };
}

interface ModulePayload<T> {
  source: "live" | "cache" | "seed";
  status: "ok" | "degraded" | "failed";
  fetchedAt: string;
  ttlSeconds: number;
  note?: string;
  items: T[];
}

interface GossipResponse {
  status: "ok";
  sources: {
    "1point3acres": ModulePayload<GossipItem>;
    weibo: ModulePayload<GossipItem>;
  };
  fetchedAt: string;
}

interface ChineseGossipProps {
  maxItemsPerSource?: number;
}

export default function ChineseGossip({ maxItemsPerSource = 3 }: ChineseGossipProps) {
  const [source1P3A, setSource1P3A] = useState<ModulePayload<GossipItem> | null>(null);
  const [sourceWeibo, setSourceWeibo] = useState<ModulePayload<GossipItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();
  const { lang } = useLanguage();
  const t = useT(lang);

  useEffect(() => {
    async function loadGossip() {
      try {
        const apiUrl = config.apiBaseUrl && !config.apiBaseUrl.startsWith("/")
          ? `${config.apiBaseUrl}/api/community/gossip`
          : `${config.apiBaseUrl || ""}/api/community/gossip`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) return;
          const result: GossipResponse = await response.json();
          setSource1P3A(result.sources["1point3acres"]);
          setSourceWeibo(result.sources.weibo);
        }
      } catch (error) {
        console.error("[ChineseGossip] Failed to fetch gossip:", error);
      } finally {
        setLoading(false);
      }
    }

    loadGossip();
    const interval = setInterval(loadGossip, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const allItems = useMemo(() => {
    const items1P3A = (source1P3A?.items ?? []).slice(0, maxItemsPerSource);
    const itemsWeibo = (sourceWeibo?.items ?? []).slice(0, maxItemsPerSource);
    const merged: GossipItem[] = [];
    const maxLen = Math.max(items1P3A.length, itemsWeibo.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < itemsWeibo.length) merged.push(itemsWeibo[i]);
      if (i < items1P3A.length) merged.push(items1P3A[i]);
    }
    return merged;
  }, [maxItemsPerSource, source1P3A, sourceWeibo]);

  const sourceLabel = (source?: string) => {
    if (source === "v2ex") return { label: "V2EX", tone: "text-emerald-400/85" };
    if (source === "reddit") return { label: "Reddit", tone: "text-orange-400/85" };
    return { label: "1P3A", tone: "text-cyan-400/85" };
  };

  if (loading && !source1P3A && !sourceWeibo) {
    return (
      <div className="grid gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-sm bg-muted/40" />
        ))}
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-6 text-center text-sm text-muted-foreground">
        {t.home.gossipEmpty}
      </div>
    );
  }

  return (
    <div className="editorial-card rounded-[1.15rem] p-4">
      <div className="mb-4 border-b border-border/25 pb-3">
        <div className="eyebrow mb-2">Community Pulse</div>
        <h3 className="text-[15px] font-semibold text-foreground/92">社区热聊</h3>
        <p className="mt-1 text-xs text-muted-foreground">把微博和论坛混在一起看，更容易判断话题热度而不是单源偏差。</p>
      </div>

      <div className="space-y-2">
        {allItems.map((item, index) => {
          const source = sourceLabel(item.meta?.source);

          return (
            <a
              key={`${item.url}-${index}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalLinkClick}
              className="group flex items-start gap-3 rounded-[0.95rem] border border-border/25 bg-background/35 px-3 py-3 transition-all hover:border-primary/35 hover:bg-background/55"
            >
              <span className={`shrink-0 text-[10px] uppercase tracking-[0.14em] ${source.tone}`}>
                {source.label}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-6 text-foreground/88 transition-colors group-hover:text-primary">
                {item.title}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
