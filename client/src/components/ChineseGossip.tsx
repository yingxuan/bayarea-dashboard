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
import { ExternalLink } from "lucide-react";
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
    'blind': ModulePayload<GossipItem>;
  };
  fetchedAt: string;
}

interface ChineseGossipProps {
  maxItemsPerSource?: number;
}

export default function ChineseGossip({ maxItemsPerSource = 3 }: ChineseGossipProps) {
  const [source1P3A, setSource1P3A] = useState<ModulePayload<GossipItem> | null>(null);
  const [sourceBlind, setSourceBlind] = useState<ModulePayload<GossipItem> | null>(null);
  const [loading, setLoading] = useState(true);

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
          const result: GossipResponse = await response.json();
          console.log('[ChineseGossip] ✅ API Response received:', {
            status: result.status,
            sources: Object.keys(result.sources),
          });
          
          setSource1P3A(result.sources['1point3acres']);
          setSourceBlind(result.sources['blind']);
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
      <div className="glow-border rounded-sm p-4 bg-card">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render source group
  const renderSourceGroup = (
    title: string,
    payload: ModulePayload<GossipItem> | null,
    sourceKey: '1point3acres' | 'blind'
  ) => {
    if (!payload || !payload.items || payload.items.length === 0) {
      return (
        <div className="rounded-sm p-3 bg-card/50 border border-border/50">
          <div className="text-center">
            <p className="text-xs text-muted-foreground font-mono">
              暂时抓不到，点这里去看原帖
            </p>
          </div>
        </div>
      );
    }

    const items = payload.items.slice(0, maxItemsPerSource);
    const showStatusMessage = payload.source === 'seed' || payload.status === 'failed' || payload.status === 'degraded';
    
    return (
      <div className="space-y-2">
        {/* Header with status */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold font-mono text-foreground/90">{title}</h3>
          {showStatusMessage && (
            <span className="text-xs opacity-70 font-mono">
              {payload.source === 'seed' ? '备用' : payload.status === 'failed' ? '暂时抓不到，已用备用' : '已显示上次结果'}
            </span>
          )}
        </div>
        
        {/* Items */}
        {items.map((item, index) => (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 md:p-4 rounded-sm bg-card/50 border border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              {/* Title */}
              <h4 className="text-sm font-semibold group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-relaxed">
                {item.title}
              </h4>
              
              {/* External Link */}
              <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors mt-0.5" />
            </div>
          </a>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 一亩三分地 · 湾区生活 */}
      {renderSourceGroup('一亩三分地 · 湾区生活', source1P3A, '1point3acres')}
      
      {/* Blind · 码农匿名吃瓜 */}
      {renderSourceGroup('Blind · 码农匿名吃瓜', sourceBlind, 'blind')}
    </div>
  );
}
