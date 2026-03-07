/**
 * Chinese Gossip Component
 * Displays gossip posts from 1point3acres and 微博热搜
 *
 * Requirements:
 * - Always shows >= 3 items per source
 * - Never shows "暂无内容"
 * - Shows 2 groups: 一亩三分地 and 微博
 * - Displays source label badges
 */

import { useEffect, useState } from "react";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface GossipItem {
  title: string;
  url: string;
  meta?: {
    source: '1point3acres' | 'weibo';
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
  status: 'ok';
  sources: {
    '1point3acres': ModulePayload<GossipItem>;
    'weibo': ModulePayload<GossipItem>;
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
        // Build API URL
        let apiUrl: string;
        if (config.apiBaseUrl && !config.apiBaseUrl.startsWith('/')) {
          apiUrl = `${config.apiBaseUrl}/api/community/gossip`;
        } else {
          const baseUrl = config.apiBaseUrl || '';
          apiUrl = `${baseUrl}/api/community/gossip`;
        }
        
        console.log('[ChineseGossip] Fetching from:', apiUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn('[ChineseGossip] Request timeout after 10 seconds, aborting...');
          controller.abort();
        }, 10000);
        
        let response: Response;
        try {
          response = await fetch(apiUrl, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
            console.warn('[ChineseGossip] Request was aborted (likely timeout)');
            setLoading(false);
            return;
          }
          throw error;
        }
        
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            console.warn('[ChineseGossip] Non-JSON response skipped:', contentType);
            return;
          }
          const result: GossipResponse = await response.json();
          console.log('[ChineseGossip] ✅ API Response received:', {
            status: result.status,
            sources: Object.keys(result.sources),
          });
          
          setSource1P3A(result.sources['1point3acres']);
          setSourceWeibo(result.sources['weibo']);
        } else {
          const errorText = await response.text();
          console.error(`[ChineseGossip] ❌ API error: ${response.status} ${response.statusText}`);
          console.error(`[ChineseGossip] Error response:`, errorText);
        }
      } catch (error) {
        console.error("[ChineseGossip] ❌ Failed to fetch gossip:", error);
        console.error("[ChineseGossip] Error details:", error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }
    
    loadGossip();
    // Refresh every 30 minutes
    const interval = setInterval(loadGossip, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !source1P3A && !sourceWeibo) {
    return (
      <div className="space-y-2 py-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-7 animate-pulse bg-muted/40 rounded-sm" />
        ))}
      </div>
    );
  }

  // Interleave items from both sources
  const getAllItems = () => {
    const items1P3A = (source1P3A?.items ?? []).slice(0, maxItemsPerSource);
    const itemsWeibo = (sourceWeibo?.items ?? []).slice(0, maxItemsPerSource);
    const merged: GossipItem[] = [];
    const maxLen = Math.max(items1P3A.length, itemsWeibo.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < itemsWeibo.length) merged.push(itemsWeibo[i]);
      if (i < items1P3A.length) merged.push(items1P3A[i]);
    }
    return merged;
  };

  const allItems = getAllItems();
  const hasAnyData = allItems.length > 0 || !!source1P3A || !!sourceWeibo;

  if (!hasAnyData) {
    return (
      <div className="py-3 text-xs opacity-50 font-mono text-center">{t.home.gossipEmpty}</div>
    );
  }

  return (
    <div className="divide-y divide-border/20">
      {allItems.length > 0 ? (
        allItems.map((item, index) => (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="flex items-baseline gap-2 py-2 px-1.5 hover:bg-muted/30 rounded-sm transition-colors group"
          >
            {item.meta?.source === 'weibo' ? (
              <span className="shrink-0 text-[10px] font-mono text-blue-400/80 leading-tight">知乎</span>
            ) : (
              <span className="shrink-0 text-[10px] font-mono text-cyan-400/70 leading-tight">1P3A</span>
            )}
            <span className="text-[12px] font-mono text-foreground/85 group-hover:text-primary transition-colors line-clamp-1 leading-tight min-w-0">
              {item.title}
            </span>
          </a>
        ))
      ) : (
        <div className="py-3 text-xs opacity-50 font-mono text-center">{t.home.gossipEmpty}</div>
      )}
    </div>
  );
}
