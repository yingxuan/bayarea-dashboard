/**
 * Chinese Gossip Component
 * Displays Chinese gossip topics for "今天聊什么"
 * 
 * Requirements:
 * - Always shows 3 items
 * - Never shows "暂无内容"
 * - Only shows title with source prefix (e.g., 【huaren】)
 * - No explanation, no truth judgment, no opinions
 */

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { config } from "@/config";

interface ChineseGossipItem {
  id: string;
  title: string; // Already includes source prefix like 【huaren】
  url: string;
  source: 'huaren' | 'blind' | 'twitter' | 'reddit' | 'hn';
  publishedAt: string;
}

interface ChineseGossipProps {
  maxItems?: number;
}

export default function ChineseGossip({ maxItems = 3 }: ChineseGossipProps) {
  const [items, setItems] = useState<ChineseGossipItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGossip() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/chinese-gossip`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const result = await response.json();
          const gossipItems = result.items || [];
          // Always ensure we have items (fallback to empty array if needed, but this should never happen)
          setItems(gossipItems.slice(0, maxItems));
        } else {
          console.error(`[ChineseGossip] API error: ${response.status} ${response.statusText}`);
          // Don't set empty array - keep previous data if available
        }
      } catch (error) {
        console.error("[ChineseGossip] Failed to fetch gossip:", error);
        // Don't set empty array - keep previous data if available
      } finally {
        setLoading(false);
      }
    }
    
    loadGossip();
    // Refresh every 30 minutes
    const interval = setInterval(loadGossip, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [maxItems]);

  if (loading && items.length === 0) {
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

  // If no items, don't show "暂无内容" - just show empty state silently
  // But this should never happen due to fallback mechanism
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-sm bg-card/50 border border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all group"
        >
          <div className="flex items-start justify-between gap-3">
            {/* Title with source prefix */}
            <h3 className="text-sm font-semibold group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-relaxed">
              {item.title}
            </h3>
            
            {/* External Link */}
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors mt-0.5" />
          </div>
        </a>
      ))}
    </div>
  );
}
