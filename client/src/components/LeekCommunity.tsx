/**
 * Leek Community Component
 * Displays latest discussions from 1point3acres
 * 
 * Requirements:
 * - Shows 5 items from 1point3acres
 * - Never shows "暂无内容"
 * - Click to open in new window
 * - "查看更多" link to forum
 */

import { useEffect, useState } from "react";
import { ExternalLink, ArrowRight } from "lucide-react";
import { config } from "@/config";

interface CommunityItem {
  source: '1point3acres';
  sourceLabel: string; // "一亩三分地"
  title: string;
  url: string;
  publishedAt?: string;
}

interface SourceStatus {
  status: 'ok' | 'unavailable';
  items: CommunityItem[];
  reason?: string;
}

interface LeekCommunityProps {
  maxItems?: number;
}

const FORUM_URL = 'https://www.1point3acres.com/bbs/forum.php?mod=forumdisplay&fid=291&filter=author&orderby=dateline';

export default function LeekCommunity({ maxItems = 5 }: LeekCommunityProps) {
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLeekPosts() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/community/leeks`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          const communityItems = result.items || [];
          setItems(communityItems.slice(0, maxItems));
          
          // Store source status for placeholder display
          if (result.sources && result.sources['1point3acres']) {
            setSourceStatus(result.sources['1point3acres']);
          }
        } else {
          console.error(`[LeekCommunity] API error: ${response.status} ${response.statusText}`);
          // Don't set empty array - keep previous data if available
        }
      } catch (error) {
        console.error("[LeekCommunity] Failed to fetch leek posts:", error);
        // Don't set empty array - keep previous data if available
      } finally {
        setLoading(false);
      }
    }

    loadLeekPosts();
    // Refresh every 30 minutes
    const interval = setInterval(loadLeekPosts, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [maxItems]);

  if (loading && items.length === 0) {
    return (
      <div className="glow-border rounded-sm p-4 bg-card">
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

  // Always render the block, even if no items (show placeholders)
  // Never hide the whole block due to fetch error
  // This ensures the block is always visible

  return (
    <div className="glow-border rounded-sm p-4 bg-card">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold font-mono text-foreground/90">
          韭菜社区
        </h3>
        <a
          href={FORUM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono flex items-center gap-1"
        >
          查看更多
          <ArrowRight className="w-3 h-3" />
        </a>
      </div>

      {/* Posts List */}
      <div className="space-y-2">
        {/* 1point3acres items (up to 5) */}
        {items
          .slice(0, maxItems)
          .map((item, index) => (
            <a
              key={`1point3acres-${index}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 rounded-sm bg-card/50 border border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-mono text-foreground/80 group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-relaxed">
                  • [{item.sourceLabel}] {item.title}
                </span>
                <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors mt-0.5" />
              </div>
            </a>
          ))}
        
        {/* Placeholder if unavailable */}
        {items.length === 0 && (
          <div className="block p-2 rounded-sm bg-card/50 border border-border/50">
            <div className="flex items-start gap-3">
              <span className="text-sm font-mono text-muted-foreground line-clamp-2 flex-1 leading-relaxed">
                • 社区暂时不可用，稍后刷新
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
