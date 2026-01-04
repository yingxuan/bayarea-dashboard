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
import MarketHighlights from "@/components/MarketHighlights";
import USStockYouTubers from "@/components/USStockYouTubers";
import IndicesCard from "@/components/IndicesCard";
import ShowsCarousel from "@/components/ShowsCarousel";
import SectionHeader from "@/components/SectionHeader";
import TimeAgo from "@/components/TimeAgo";
import ReturnHintToast, { ReturnToDashboardToast } from "@/components/ReturnHintToast";
import { useHoldings } from "@/hooks/useHoldings";
import { QuoteData } from "@/hooks/usePortfolioSummary";
import { useExternalLink } from "@/hooks/useExternalLink";
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
  // Mobile return hint
  const { 
    showHint, 
    dismissHint, 
    showReturnHint,
    dismissReturnHint,
    handleReturnHintClick,
    handleExternalLinkClick, 
    isStandalone 
  } = useExternalLink();

  // Section 1: 打工耽误赚钱
  const [marketNews, setMarketNews] = useState<any[]>([]); // 市场要闻
  const [chineseNews, setChineseNews] = useState<any[]>([]); // Top 3 中文美股新闻
  const [stockYoutubers, setStockYoutubers] = useState<any[]>([]); // 美股博主视频（每频道1条）
  const [stockYoutubersOffset, setStockYoutubersOffset] = useState(0); // Offset for "换一批" functionality
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
  const [showsOffset, setShowsOffset] = useState(0); // Offset for "换一批" functionality
  const [deals, setDeals] = useState<any[]>([]); // 薅羊毛
  const [dealsSourceMode, setDealsSourceMode] = useState<'live' | 'cache' | 'seed'>('live'); // Deals source mode

  useEffect(() => {
    async function loadAllData() {
      // Section 1: 打工耽误赚钱 - 市场要闻 + 中文美股新闻
      try {
        const apiUrl = `${config.apiBaseUrl}/api/market-news`;
        const response = await fetchWithTimeout(apiUrl);
        if (response.ok) {
          const result = await response.json();
          const newsItems = result.items || [];
          if (newsItems.length > 0) {
            // 前3条作为市场看点中的新闻
            setMarketNews(newsItems.slice(0, 3)); // Top 3 for market news
            // chineseNews 不再使用（已整合到 marketNews）
            setChineseNews([]);
          } else {
            setMarketNews([]);
            setChineseNews([]);
          }
        } else {
          setMarketNews([]);
          setChineseNews([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch market news:", error);
        setMarketNews([]);
        setChineseNews([]);
      }

      // Section 1: 打工耽误赚钱 - 美股博主视频（每频道1条，至少获取6个用于轮换）
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
          // 获取至少8个用于轮换（桌面显示4个，移动端carousel）
          setStockYoutubers(Array.from(channelMap.values()).slice(0, 8));
          setStockYoutubersOffset(0); // Reset offset when new data is loaded
        }
      } catch (error) {
        console.error("[Home] Failed to fetch stock youtubers:", error);
        setStockYoutubers([]);
        setStockYoutubersOffset(0);
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
          setShowsOffset(0); // Reset offset when new data is loaded
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
          // Ensure >= 3 items, show up to 10 in carousel
          if (dealsItems.length >= 3) {
            setDeals(dealsItems.slice(0, 10));
            setDealsSourceMode(result.sourceMode || 'live');
          } else {
            // If < 3 items, still show what we have (fallback to seed should ensure >= 3)
            setDeals(dealsItems);
            setDealsSourceMode(result.sourceMode || 'seed');
          }
        } else {
          setDeals([]);
          setDealsSourceMode('seed');
        }
      } catch (error) {
        console.error("[Home] Failed to fetch deals:", error);
        setDeals([]);
        setDealsSourceMode('seed');
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
      <ReturnHintToast show={showHint} onDismiss={dismissHint} isStandalone={isStandalone} />
      <ReturnToDashboardToast 
        show={showReturnHint} 
        onDismiss={dismissReturnHint}
        onClick={handleReturnHintClick}
      />

      <main className="w-full min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-3 space-y-4">
          {/* SECTION 1: 打工耽误赚钱 */}
          <section className="flex flex-col gap-4 min-w-0">
            <div className="mb-2 mt-2">
              <h1 className="text-[15px] font-medium font-mono leading-tight">
                <span className="neon-text-blue">打工耽误赚钱</span>
              </h1>
            </div>

            {/* 1) First Row: Portfolio Summary + Indices (Desktop: 2 columns, Mobile: stack) */}
            <div className="grid grid-cols-1 md:grid-cols-[2.2fr_1fr] gap-4">
              {/* Left: Portfolio Summary Card */}
              <div className="min-w-0">
                <PortfolioHero
                  quotesData={quotesData}
                  holdings={holdings}
                  holdingsLoaded={holdingsLoaded}
                  ytdBaseline={ytdBaseline}
                  onYtdBaselineChange={updateYtdBaseline}
                />
              </div>

              {/* Right: Indices Card */}
              <div className="min-w-0">
                <IndicesCard />
              </div>
            </div>

            {/* 2) 市场看点 (Market Highlights: 新闻/一亩三分地) */}
            <div className="w-full min-w-0">
              <SectionHeader title="市场看点" />
              <MarketHighlights marketNews={marketNews} />
            </div>

            {/* 3) 美股博主 (独立整行，桌面4个，移动端carousel) */}
            <div className="w-full min-w-0">
              <USStockYouTubers 
                stockYoutubers={stockYoutubers}
                offset={stockYoutubersOffset}
                onRefresh={() => {
                  const VIDEOS_PER_BATCH = 4;
                  setStockYoutubersOffset(prev => {
                    const nextOffset = prev + VIDEOS_PER_BATCH;
                    // Wrap around if we've reached the end
                    return nextOffset >= stockYoutubers.length ? 0 : nextOffset;
                  });
                }}
              />
            </div>
          </section>

          {/* SECTION 2: 民以食为天 */}
          <section className="flex flex-col gap-4 min-w-0 mt-8">
            <div className="mb-2 mt-2">
              <h1 className="text-[15px] font-medium font-mono leading-tight">
                <span className="neon-text-blue">民以食为天</span>
              </h1>
            </div>

            {/* Fixed 2×2 grid: 奶茶/中餐, 夜宵/甜品 */}
            <div className="w-full min-w-0">
              <TodaySpendCarousels />
            </div>
          </section>

          {/* SECTION 3: 追剧吃瓜薅羊毛 */}
          <section className="flex flex-col gap-4 min-w-0 mt-8">
            <div className="mb-2 mt-2">
              <h1 className="text-[15px] font-medium font-mono leading-tight">
                <span className="neon-text-blue">追剧吃瓜薅羊毛</span>
              </h1>
            </div>

            {/* 1) Horizontal carousel: 追剧 */}
            {shows.length > 0 && (
              <div className="w-full min-w-0 overflow-hidden">
                <SectionHeader title="追剧" />
                <ShowsCarousel 
                  shows={shows} 
                  offset={showsOffset}
                  onRefresh={() => {
                    // For "换一批", increment offset to rotate shows within each platform
                    setShowsOffset(prev => {
                      const nextOffset = prev + 1;
                      // Wrap around after reasonable number of rotations
                      return nextOffset >= 10 ? 0 : nextOffset;
                    });
                  }}
                />
              </div>
            )}

            {/* 2) Horizontal row: 吃瓜 and 薅羊毛 */}
            <div className="w-full min-w-0 flex flex-col md:flex-row gap-4 md:items-stretch">
              {/* 吃瓜 - Left side */}
              <div className="w-full md:w-1/2 min-w-0 flex flex-col">
                <SectionHeader title="吃瓜" />
                <div className="flex-1">
                  <ChineseGossip maxItemsPerSource={5} />
                </div>
              </div>

              {/* 薅羊毛 - Right side - Vertical cards */}
              {deals.length >= 3 && (
                <div className="w-full md:w-1/2 min-w-0 flex flex-col">
                  <div className="mb-2">
                    <div className="flex items-baseline justify-between mb-2">
                      <h3 className="text-[13px] font-mono font-medium text-foreground/80">薅羊毛</h3>
                      {/* Source mode indicator - aligned with header */}
                      {dealsSourceMode && (
                        <span className="text-xs opacity-50 text-muted-foreground font-mono">
                          {dealsSourceMode === 'live' ? '实时' : dealsSourceMode === 'cache' ? '缓存' : '种子'}
                        </span>
                      )}
                    </div>
                    <div className="border-b border-border/30"></div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {deals.slice(0, 4).map((deal) => (
                      <a
                        key={deal.id}
                        href={deal.external_url || deal.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleExternalLinkClick}
                        className="block rounded-sm p-4 bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
                              <span className="text-[11px] text-muted-foreground/70 font-mono font-normal">
                                {deal.sourceLabel || deal.source || deal.store || 'Deal'}
                              </span>
                              {deal.publishedAt && (
                                <>
                                  <span className="text-[11px] text-muted-foreground/60">•</span>
                                  <TimeAgo isoString={deal.publishedAt} />
                                </>
                              )}
                              {!deal.publishedAt && deal.time_ago && (
                                <>
                                  <span className="text-[11px] text-muted-foreground/60">•</span>
                                  <span className="text-[11px] text-muted-foreground/70 font-mono font-normal">{deal.time_ago}</span>
                                </>
                              )}
                              {deal.score !== undefined && deal.score > 0 && (
                                <>
                                  <span className="text-[11px] text-muted-foreground/60">•</span>
                                  <span className="text-[11px] text-primary font-mono font-medium tabular-nums">↑{deal.score}</span>
                                </>
                              )}
                            </div>
                            <h4 className="text-[13px] font-normal group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-tight">
                              {deal.title}
                            </h4>
                            {deal.comments !== undefined && deal.comments > 0 && (
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
