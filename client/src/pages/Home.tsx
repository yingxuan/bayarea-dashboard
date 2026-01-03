/**
 * 湾区华人每日生存与机会面板
 * 3个主要垂直部分：
 * 1) 打工耽误赚钱 - 股票/市场/投资内容
 * 2) 民以食为天 - 食物推荐
 * 3) 追剧吃瓜薅羊毛 - 娱乐/八卦/优惠
 * 
 * 全局原则：
 * - 一切内容必须可转化为：钱 / 行动 / 社交话题
 * - 不做纯信息、不做百科、不做教育
 * - 首页服务的是"真实生活"，不是理性最优
 * - 每个section 10秒可扫完
 * - 宁缺毋滥
 * - 与湾区华人无关的内容不出现
 */

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import TodaySpendCarousels from "@/components/TodaySpendCarousels";
import ChineseGossip from "@/components/ChineseGossip";
import PortfolioHero from "@/components/PortfolioHero";
import MarketSnapshotCarousel from "@/components/MarketSnapshotCarousel";
import CommunityVideoCarousel from "@/components/CommunityVideoCarousel";
import DealsCarousel from "@/components/DealsCarousel";
import ShowsCarousel from "@/components/ShowsCarousel";
import { useHoldings } from "@/hooks/useHoldings";
import { QuoteData } from "@/hooks/usePortfolioSummary";
import { config } from "@/config";

// Helper function for API requests with timeout
async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default function Home() {
  // Section 1: 打工耽误赚钱
  const [marketNews, setMarketNews] = useState<any[]>([]); // 市场要闻
  const [stockYoutubers, setStockYoutubers] = useState<any[]>([]); // 美股博主视频（每频道1条）
  const { holdings, isLoaded: holdingsLoaded, ytdBaseline, updateYtdBaseline } = useHoldings();
  
  // Fetch quotes for PortfolioHero
  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  
  // Fetch quotes when holdings change
  useEffect(() => {
    if (!holdingsLoaded || holdings.length === 0) {
      setQuotesData({});
      return;
    }

    const fetchQuotes = async () => {
      try {
        const tickers = holdings.map(h => h.ticker.toUpperCase()).join(',');
        const apiUrl = `${config.apiBaseUrl}/api/quotes?tickers=${encodeURIComponent(tickers)}`;
        
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
        });
        
        if (!response.ok) {
          throw new Error(`Quotes API error: ${response.status}`);
        }
        
        const result = await response.json();
        const quotes: Array<{
          ticker: string;
          status: 'ok' | 'stale' | 'unavailable';
          price: number;
          prevClose?: number;
          change?: number;
          changePercent?: number;
          error?: string;
        }> = result.quotes || [];
        
        const quotesMap: Record<string, QuoteData> = {};
        quotes.forEach(quote => {
          const price = Number(quote.price);
          const prevClose = quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;
          const change = quote.change !== undefined ? Number(quote.change) : undefined;
          const changePercent = quote.changePercent !== undefined ? Number(quote.changePercent) : undefined;
          
          if (isNaN(price) || price <= 0) {
            return;
          }
          
          quotesMap[quote.ticker.toUpperCase()] = {
            price,
            prevClose,
            change,
            changePercent,
            status: quote.status,
          };
        });
        
        setQuotesData(quotesMap);
      } catch (error) {
        console.error('[Home] Failed to fetch quotes:', error);
        setQuotesData({});
      }
    };

    fetchQuotes();
  }, [holdings, holdingsLoaded]);

  // Section 3: 追剧吃瓜薅羊毛
  const [shows, setShows] = useState<any[]>([]); // 追剧
  const [deals, setDeals] = useState<any[]>([]); // 薅羊毛

  useEffect(() => {
    async function loadAllData() {
      // Section 1: 打工耽误赚钱 - 市场要闻
      try {
        const apiUrl = `${config.apiBaseUrl}/api/market-news`;
        const response = await fetchWithTimeout(apiUrl);
        if (response.ok) {
          const result = await response.json();
          const newsItems = result.items || [];
          if (newsItems.length > 0) {
            setMarketNews(newsItems.slice(0, 3)); // Top 3 for market news card
          } else {
            setMarketNews([]);
          }
        } else {
          setMarketNews([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch market news:", error);
        setMarketNews([]);
      }

      // Section 1: 打工耽误赚钱 - 美股博主视频（每频道1条）
      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/youtubers?category=stock`);
        if (response.ok) {
          const result = await response.json();
          const items = result.items || result.youtubers || [];
          // 按频道分组，每频道只取最新1条
          const channelMap = new Map<string, any>();
          items.forEach((item: any) => {
            const channelName = item.channelName || item.channel || '';
            if (channelName && item.status === 'ok') {
              if (!channelMap.has(channelName)) {
                channelMap.set(channelName, item);
              } else {
                const existing = channelMap.get(channelName);
                const existingTime = new Date(existing.publishedAt || 0).getTime();
                const currentTime = new Date(item.publishedAt || 0).getTime();
                if (currentTime > existingTime) {
                  channelMap.set(channelName, item);
                }
              }
            }
          });
          setStockYoutubers(Array.from(channelMap.values()).slice(0, 5));
        }
      } catch (error) {
        console.error("[Home] Failed to fetch stock youtubers:", error);
        setStockYoutubers([]);
      }

      // Section 3: 追剧吃瓜薅羊毛 - 追剧
      try {
        // Build API URL - handle both absolute URLs and relative paths
        let apiUrl: string;
        if (config.apiBaseUrl && !config.apiBaseUrl.startsWith('/')) {
          // Absolute URL
          apiUrl = `${config.apiBaseUrl}/api/shows`;
        } else {
          // Relative path
          const baseUrl = config.apiBaseUrl || '';
          apiUrl = `${baseUrl}/api/shows`;
        }
        
        console.log('[Home] Fetching shows from:', apiUrl);
        const response = await fetchWithTimeout(apiUrl);
        if (response.ok) {
          const result = await response.json();
          const showsItems = result.items || result.shows || [];
          console.log('[Home] ✅ Fetched shows:', showsItems.length, 'items');
          setShows(showsItems); // All videos, no limit
        } else {
          console.warn('[Home] Shows API returned:', response.status, response.statusText);
          setShows([]);
        }
      } catch (error) {
        console.error("[Home] ❌ Failed to fetch shows:", error);
        setShows([]);
      }

      // Section 3: 追剧吃瓜薅羊毛 - 薅羊毛
      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/deals`);
        if (response.ok) {
          const result = await response.json();
          const dealsItems = result.items || result.deals || [];
          setDeals(dealsItems.slice(0, 6)); // Top 6 deals
        } else {
          setDeals([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch deals:", error);
        setDeals([]);
      }
    }
    
    loadAllData();
    // Refresh every 30 minutes
    const interval = setInterval(loadAllData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-3 space-y-6">
          {/* SECTION 1: 打工耽误赚钱 */}
          <section className="flex flex-col gap-3 min-w-0">
          <div className="mb-2">
            <h1 className="text-2xl font-bold font-mono">
              <span className="neon-text-blue">打工耽误赚钱</span>
            </h1>
          </div>

          {/* 1) Hero (compact, full width) */}
          <PortfolioHero
            quotesData={quotesData}
            holdings={holdings}
            holdingsLoaded={holdingsLoaded}
            ytdBaseline={ytdBaseline}
            onYtdBaselineChange={updateYtdBaseline}
          />

            {/* 2) Horizontal carousel: 市场快照 (3 cards, swipe) */}
            <div className="w-full min-w-0">
              <h3 className="text-xs font-semibold font-mono text-foreground/70 mb-1.5">市场快照</h3>
              <div className="w-full min-w-0 overflow-hidden">
                <MarketSnapshotCarousel marketNews={marketNews} />
              </div>
            </div>

            {/* 3) Horizontal carousel: 社区 & 视频 (2 cards, swipe) */}
            <div className="w-full min-w-0">
              <h3 className="text-xs font-semibold font-mono text-foreground/70 mb-1.5">社区 & 视频</h3>
              <div className="w-full min-w-0 overflow-hidden">
                <CommunityVideoCarousel stockYoutubers={stockYoutubers} />
              </div>
            </div>
          </section>

          {/* SECTION 2: 民以食为天 */}
          <section className="flex flex-col gap-3 min-w-0">
            <div>
              <h1 className="text-2xl font-bold font-mono">
                <span className="neon-text-blue">民以食为天</span>
              </h1>
            </div>

            {/* Fixed 2×2 grid: 奶茶/中餐, 夜宵/甜品 */}
            <div className="w-full min-w-0">
              <TodaySpendCarousels />
            </div>
          </section>

          {/* SECTION 3: 追剧吃瓜薅羊毛 */}
          <section className="flex flex-col gap-3 min-w-0">
            <div>
              <h1 className="text-2xl font-bold font-mono">
                <span className="neon-text-blue">追剧吃瓜薅羊毛</span>
              </h1>
            </div>

            {/* 1) Horizontal carousel: 追剧 */}
            {shows.length > 0 && (
              <div className="w-full min-w-0 overflow-hidden">
                <h3 className="text-xs font-semibold font-mono text-foreground/70 mb-1.5">追剧</h3>
                <ShowsCarousel shows={shows} />
              </div>
            )}

            {/* 2) Horizontal row: 吃瓜 and 薅羊毛 */}
            <div className="w-full min-w-0 flex flex-col md:flex-row gap-3">
              {/* 吃瓜 - Left side */}
              <div className="w-full md:w-1/2 min-w-0">
                <h3 className="text-xs font-semibold font-mono text-foreground/70 mb-1.5">吃瓜</h3>
                <ChineseGossip maxItems={3} />
              </div>

              {/* 薅羊毛 - Right side - Vertical 3 cards */}
              {deals.length > 0 && (
                <div className="w-full md:w-1/2 min-w-0">
                  <h3 className="text-xs font-semibold font-mono text-foreground/70 mb-1.5">薅羊毛</h3>
                  <div className="space-y-3">
                    {deals.slice(0, 3).map((deal) => (
                      <a
                        key={deal.id}
                        href={deal.external_url || deal.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-sm bg-card/50 border border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs text-muted-foreground font-mono">{deal.store || 'Deal'}</span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">{deal.time_ago || ''}</span>
                              {deal.score > 0 && (
                                <>
                                  <span className="text-xs text-muted-foreground">•</span>
                                  <span className="text-xs text-primary font-mono font-bold">↑{deal.score}</span>
                                </>
                              )}
                            </div>
                            <h4 className="text-sm font-semibold group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-relaxed">
                              {deal.title}
                            </h4>
                            {deal.comments > 0 && (
                              <div className="mt-1.5 text-xs text-muted-foreground font-mono">
                                💬 {deal.comments} 评论
                              </div>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground font-mono">
            <div>
              <span className="neon-text-blue font-bold">湾区华人每日生存与机会面板</span>
              <span className="ml-2">| 每个section 10秒可扫完</span>
            </div>
            <div className="flex items-center gap-4">
              <span>数据每日更新</span>
              <span>•</span>
              <span>宁缺毋滥</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
