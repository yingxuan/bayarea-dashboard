/**
 * Chinese Gossip Component
 * Displays gossip posts from 1point3acres and TeamBlind
 * 
 * Requirements:
 * - Always shows >= 3 items per source
 * - Never shows "暂无内容"
 * - Shows 2 groups: 一亩三分地 and Blind
 * - Displays source/status information
 */

import { useEffect, useState } from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";

interface GossipItem {
  title: string;
  url: string;
  meta?: {
    source: '1point3acres' | 'blind';
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
  };
  fetchedAt: string;
}

interface ChineseGossipProps {
  maxItemsPerSource?: number;
}

export default function ChineseGossip({ maxItemsPerSource = 3 }: ChineseGossipProps) {
  const [source1P3A, setSource1P3A] = useState<ModulePayload<GossipItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const { handleExternalLinkClick } = useExternalLink();

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

  if (loading && !source1P3A && !sourceBlind) {
    return (
      <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md">
          <div className="animate-pulse">
            <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </div>
      </div>
    );
  }

  // Get all items with labels, merged from all sources
  const getAllItems = () => {
    if (!source1P3A?.items) return [];
    return source1P3A.items.slice(0, maxItemsPerSource);
  };

  const allItems = getAllItems();
  const hasAnyData = allItems.length > 0 || source1P3A || sourceBlind;

  if (!hasAnyData) {
    return (
      <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md">
        <div className="text-center">
          <p className="text-xs opacity-60 text-muted-foreground font-mono font-normal">
            暂时抓不到，点这里去看原帖
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* All items merged, showing as "today's gossip" - 帖子列表（5条） */}
        {allItems.length > 0 ? (
        allItems.map((item, index) => (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalLinkClick}
            className="block rounded-sm p-4 bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-[13px] font-normal group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                  {item.title}
                </h4>
              </div>
              <ExternalLinkIcon className="w-4 h-4 opacity-60 text-muted-foreground flex-shrink-0 group-hover:text-primary group-hover:opacity-100 transition-colors mt-0.5" />
            </div>
          </a>
        ))
      ) : (
        <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md">
          <div className="text-center">
            <p className="text-xs opacity-60 text-muted-foreground font-mono font-normal">
              暂时抓不到，点这里去看原帖
            </p>
          </div>
      )}
    </div>
  );
}
