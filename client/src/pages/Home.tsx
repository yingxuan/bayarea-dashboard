/**
 * 湾区华人每日生存与机会面板
 * 核心回答3个问题：
 * 1) 今天怎么赚钱
 * 2) 今天怎么花钱
 * 3) 今天聊什么
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
import FinanceOverview from "@/components/FinanceOverview";
import NewsList from "@/components/NewsList";
import FoodGrid from "@/components/FoodGrid";
import GossipList from "@/components/GossipList";
import YouTubersList from "@/components/YouTubersList";
import TodaySpendRecommendations from "@/components/TodaySpendRecommendations";
import ChineseGossip from "@/components/ChineseGossip";
import LeekCommunity from "@/components/LeekCommunity";
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
  // Section 1: 今天怎么赚钱
  const [marketNews, setMarketNews] = useState<any[]>([]); // 解释型市场要闻（只限解释涨跌）
  const [stockYoutubers, setStockYoutubers] = useState<any[]>([]); // 美股博主视频（每频道1条）

  // Section 2: 今天怎么花钱
  // 使用新的自动推荐模块，不再需要单独的状态

  // Section 3: 今天聊什么
  // 使用新的中文八卦模块，不再需要单独的状态

  useEffect(() => {
    async function loadAllData() {
      // Section 1: 今天怎么赚钱
      // 解释型市场要闻（使用 Google Finance 新闻）
      try {
        const apiUrl = `${config.apiBaseUrl}/api/market-news`;
        const response = await fetchWithTimeout(apiUrl);
        if (response.ok) {
          const result = await response.json();
          const newsItems = result.items || [];
          setMarketNews(newsItems.slice(0, 3)); // 最多3条
        } else {
          // Fallback: try old API
          const fallbackUrl = `${config.apiBaseUrl}/api/ai-news`;
          const fallbackResponse = await fetchWithTimeout(fallbackUrl);
          if (fallbackResponse.ok) {
            const fallbackResult = await fallbackResponse.json();
            const newsItems = fallbackResult.items || fallbackResult.news || [];
            setMarketNews(newsItems.slice(0, 5));
          }
        }
      } catch (error) {
        console.error("[Home] Failed to fetch market news:", error);
        // Set seed data to ensure never empty
        setMarketNews([
          { title: '美股市场更新', title_en: 'US Stock Market Update', url: 'https://www.google.com/finance/', source: 'Google Finance' },
          { title: '科技股表现', title_en: 'Tech Stocks Performance', url: 'https://www.google.com/finance/', source: 'Google Finance' },
          { title: '今日市场分析', title_en: 'Market Analysis Today', url: 'https://www.google.com/finance/', source: 'Google Finance' },
        ]);
      }

      // 美股博主视频（每频道1条）
      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/youtubers?category=stock&nocache=1`);
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
                // 如果已有，比较发布时间，保留最新的
                const existing = channelMap.get(channelName);
                const existingTime = new Date(existing.publishedAt || 0).getTime();
                const currentTime = new Date(item.publishedAt || 0).getTime();
                if (currentTime > existingTime) {
                  channelMap.set(channelName, item);
                }
              }
            }
          });
          setStockYoutubers(Array.from(channelMap.values()).slice(0, 5)); // 最多5个频道
        }
      } catch (error) {
        console.error("[Home] Failed to fetch stock youtubers:", error);
        setStockYoutubers([]);
      }

      // Section 2: 今天怎么花钱
      // 使用新的自动推荐模块 (TodaySpendRecommendations)
      // 数据由组件内部获取，无需在这里处理

      // Section 3: 今天聊什么
      // 使用新的中文八卦模块 (ChineseGossip)
      // 数据由组件内部获取，无需在这里处理
    }
    
    loadAllData();
    // Refresh every 30 minutes
    const interval = setInterval(loadAllData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="container py-6 space-y-12">
        {/* Section 1: 今天怎么赚钱 */}
        <section>
          <div className="mb-6">
            <h1 className="text-2xl font-bold font-mono mb-2">
              <span className="neon-text-blue">今天怎么赚钱</span>
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              持仓总览 • Top Movers • 市场要闻 • 美股博主
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：我的持仓总览 + Top Movers */}
            <div className="lg:col-span-1 space-y-6">
              <FinanceOverview />
            </div>

            {/* 中间：解释型市场要闻（只限解释涨跌）+ 韭菜社区 */}
            <div className="lg:col-span-1 space-y-6">
              <div>
                <div className="mb-3">
                  <h2 className="text-lg font-bold font-mono flex items-center gap-2 mb-1">
                    <span className="neon-text-blue">市场要闻</span>
                  </h2>
                </div>
                {marketNews.length > 0 ? (
                  <div className="space-y-2">
                    {marketNews.slice(0, 3).map((item: any, index: number) => (
                      <a
                        key={index}
                        href={item.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block glow-border rounded-sm p-3 bg-card hover:bg-card/80 transition-all group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span className="text-sm font-mono text-foreground/80 group-hover:text-primary transition-colors line-clamp-2 flex-1 leading-relaxed">
                            {item.title || item.title_en || 'Market News'}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="glow-border rounded-sm p-4 bg-card">
                    <div className="text-sm text-muted-foreground font-mono text-center py-4">
                      暂无市场要闻
                    </div>
                  </div>
                )}
              </div>

              {/* 韭菜社区 (5条一亩三分地 + 3条文学城) */}
              <LeekCommunity maxItems={8} />
            </div>

            {/* 右侧：美股博主视频（每频道1条） */}
            <div className="lg:col-span-1">
              <div className="mb-3">
                <h2 className="text-lg font-bold font-mono flex items-center gap-2 mb-1">
                  <span className="neon-text-blue">美股博主</span>
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  每频道1条最新视频
                </p>
              </div>
              {stockYoutubers.length > 0 ? (
                <YouTubersList items={stockYoutubers} maxItems={5} />
              ) : (
                <div className="glow-border rounded-sm p-4 bg-card">
                  <div className="text-sm text-muted-foreground font-mono text-center py-4">
                    暂无更新
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: 今天怎么花钱 */}
        <section>
          <div className="mb-6">
            <h1 className="text-2xl font-bold font-mono mb-2">
              <span className="neon-text-blue">今天怎么花钱</span>
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              新开/热门奶茶、中餐、咖啡、甜品 • 基于湾区位置（Cupertino/Sunnyvale/SJ）• 今天或这周能去
            </p>
          </div>

          <TodaySpendRecommendations maxItems={6} />
        </section>

        {/* Section 3: 今天聊什么 */}
        <section>
          <div className="mb-6">
            <h1 className="text-2xl font-bold font-mono mb-2">
              <span className="neon-text-blue">今天聊什么</span>
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              中文八卦 · 华人优先 • 固定3条 • 只显示标题
            </p>
          </div>

          <ChineseGossip maxItems={3} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="container">
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
