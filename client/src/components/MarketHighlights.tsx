/**
 * Market Highlights Component
 * 2 columns: 新闻 / 一亩三分地
 * Desktop: grid-cols-2 (两栏等权、等高)
 * Mobile: Vertical stack (新闻 -> 一亩三分地)
 */

import { useEffect, useState } from "react";
import { config } from "@/config";

interface CommunityItem {
  source: '1point3acres';
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt?: string;
}

interface MarketHighlightsProps {
  marketNews: any[]; // Top 3 中文美股新闻
}

export default function MarketHighlights({ marketNews }: MarketHighlightsProps) {
  const [leekItems, setLeekItems] = useState<CommunityItem[]>([]);

  // Fetch 一亩三分地 posts
  useEffect(() => {
    async function loadLeekPosts() {
      try {
        const apiUrl = `${config.apiBaseUrl}/api/community/leeks`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const result = await response.json();
          const communityItems = result.items || [];
          setLeekItems(communityItems.slice(0, 3)); // Top 3 for display
        }
      } catch (error) {
        console.error("[MarketHighlights] Failed to fetch leek posts:", error);
      }
    }

    loadLeekPosts();
    const interval = setInterval(loadLeekPosts, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-sm p-4 bg-card border border-border/40 shadow-md">
      {/* Desktop: 2 columns (新闻/一亩三分地), Mobile: vertical stack */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
        {/* Column 1: 新闻（Top 3 中文美股新闻） */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[13px] font-mono font-medium text-foreground/80">新浪财经</h4>
            <a
              href="https://finance.sina.com.cn/stock/usstock/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal"
            >
              更多
            </a>
          </div>
          {marketNews.length > 0 ? (
            <div className="space-y-0.5" style={{ lineHeight: '1.3' }}>
              {marketNews.slice(0, 3).map((item: any, index: number) => (
                <a
                  key={index}
                  href={item.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block py-0.5 hover:bg-card/80 transition-all group rounded-sm ${
                    index < marketNews.length - 1 ? 'border-b border-border/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-primary mt-1 text-[10px] flex-shrink-0">•</span>
                    <span className="text-[13px] font-normal font-mono text-foreground/90 group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-tight">
                      {item.title || item.title_zh || item.title_en || 'Market News'}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-xs opacity-60 font-mono font-normal text-center py-2">
              暂无新闻
            </div>
          )}
        </div>

        {/* Column 3: 一亩三分地（3条帖子）- 直接显示话题列表 */}
        <div className="min-w-0 md:border-l md:border-border/10 md:pl-4">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[13px] font-mono font-medium text-foreground/80">一亩三分地</h4>
            <a
              href="https://rsshub.app/1point3acres/section/400"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs opacity-60 hover:opacity-100 transition-opacity font-mono font-normal"
            >
              更多
            </a>
          </div>
          {leekItems.length > 0 ? (
            <div className="space-y-0.5" style={{ lineHeight: '1.3' }}>
              {leekItems.slice(0, 3).map((item, index) => (
                <a
                  key={`leek-${index}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block py-0.5 hover:bg-card/80 transition-all group rounded-sm ${
                    index < Math.min(leekItems.length, 3) - 1 ? 'border-b border-border/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-primary mt-1 text-[10px] flex-shrink-0">•</span>
                    <span className="text-[13px] font-normal font-mono text-foreground/90 group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-tight">
                      {item.title}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-xs opacity-60 font-mono font-normal text-center py-2">
              暂无更新
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
