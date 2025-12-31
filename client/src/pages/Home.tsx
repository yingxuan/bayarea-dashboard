/**
 * Data Punk Design: Homepage with all dashboard modules
 * - Grid background pattern
 * - Asymmetric layout (70% main content, 30% sidebar on desktop)
 * - Mobile-first responsive design
 * - All modules with neon accents and glow effects
 */

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import FinanceOverview from "@/components/FinanceOverview";
import VideoGrid from "@/components/VideoGrid";
import NewsList from "@/components/NewsList";
import FoodGrid from "@/components/FoodGrid";
import DealsGrid from "@/components/DealsGrid";
import GossipList from "@/components/GossipList";
import ShowsCard from "@/components/ShowsCard";
import JobMarketTemperature from "@/components/JobMarketTemperature";
import {
  mockChineseRestaurants,
  mockBubbleTeaShops,
  mockShows,
  mockGossip,
  mockDeals,
} from "@/lib/mockData";
import { config } from "@/config";

export default function Home() {
  const [industryNews, setIndustryNews] = useState<any>(null);
  const [chineseRestaurants, setChineseRestaurants] = useState<any>(null);
  const [bubbleTeaShops, setBubbleTeaShops] = useState<any>(null);
  const [shows, setShows] = useState<any>(null);
  const [gossip, setGossip] = useState<any>(null);
  const [deals, setDeals] = useState<any>(null);

  useEffect(() => {
    // Load mock data for non-API sections
    setChineseRestaurants(mockChineseRestaurants);
    setBubbleTeaShops(mockBubbleTeaShops);
    setShows(mockShows);
    setGossip(mockGossip);
    setDeals(mockDeals);
    
    // Fetch real AI news from serverless API
    async function loadAINews() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/ai-news`);
        if (response.ok) {
          const result = await response.json();
          console.log('[Home] AI news loaded:', result.news.length, 'items');
          setIndustryNews({ news: result.news });
        } else {
          console.error('[Home] AI news API error:', response.statusText);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch AI news:", error);
      }
    }
    
    loadAINews();
    // Refresh every 30 minutes
    const interval = setInterval(loadAINews, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="container py-8">
        {/* Finance Section */}
        <section className="mb-12">
          <FinanceOverview />
        </section>



        {/* Industry News */}
        {industryNews && industryNews.news && (
          <section className="mb-12">
            <div className="mb-4">
              <h2 className="text-lg font-bold font-mono flex items-center gap-2 mb-1">
                <span className="neon-text-blue">行业新闻</span>
                <span className="text-muted-foreground text-sm">
                  | 今日必须知道的事
                </span>
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                今天影响钱和工作的科技要闻
              </p>
            </div>
            <NewsList news={industryNews.news} maxItems={5} showTags={true} />
          </section>
        )}



        {/* Job Market Temperature */}
        <section className="mb-12">
          <JobMarketTemperature 
            layoffCount={2}
            hiringCount={5}
            spyChangePercent={0.26}
          />
        </section>

        {/* Food Section */}
        <section className="mb-12">
          <h2 className="text-lg font-bold font-mono mb-6 flex items-center gap-2">
            <span className="neon-text-blue">吃喝玩乐</span>
            <span className="text-muted-foreground text-sm">
              | 今天去哪吃
            </span>
          </h2>

          <div className="space-y-8">
            {/* Chinese Restaurants */}
            {chineseRestaurants && chineseRestaurants.restaurants && (
              <div>
                <h3 className="text-base font-semibold mb-4 font-mono text-foreground/90">
                  中餐推荐 <span className="text-muted-foreground text-sm">10 miles</span>
                </h3>
                <FoodGrid
                  places={chineseRestaurants.restaurants}
                  maxItems={4}
                  showCuisine={true}
                />
              </div>
            )}

            {/* Bubble Tea */}
            {bubbleTeaShops && bubbleTeaShops.shops && (
              <div>
                <h3 className="text-base font-semibold mb-4 font-mono text-foreground/90">
                  奶茶店 <span className="text-muted-foreground text-sm">5 miles</span>
                </h3>
                <FoodGrid places={bubbleTeaShops.shops} maxItems={4} />
              </div>
            )}
          </div>
        </section>

        {/* Shows Section */}
        {shows && shows.shows && (
          <section className="mb-12">
            <h2 className="text-lg font-bold font-mono mb-4 flex items-center gap-2">
              <span className="neon-text-blue">追剧推荐</span>
              <span className="text-muted-foreground text-sm">
                | 下班后看什么
              </span>
            </h2>
            <ShowsCard shows={shows.shows} maxItems={3} />
          </section>
        )}

        {/* Gossip Section */}
        {gossip && gossip.posts && (
          <section className="mb-12">
            <h2 className="text-lg font-bold font-mono mb-4 flex items-center gap-2">
              <span className="neon-text-blue">吃瓜</span>
              <span className="text-muted-foreground text-sm">
                | 华人论坛热帖
              </span>
            </h2>
            <GossipList posts={gossip.posts} maxItems={10} />
          </section>
        )}

        {/* Deals Section */}
        {deals && deals.deals && (
          <section className="mb-12">
            <h2 className="text-lg font-bold font-mono mb-4 flex items-center gap-2">
              <span className="neon-text-blue">遍地羊毛</span>
              <span className="text-muted-foreground text-sm">
                | 今天有什么值得省钱的
              </span>
            </h2>
            <DealsGrid deals={deals.deals} maxItems={12} />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground font-mono">
            <div>
              <span className="neon-text-blue font-bold">湾区码农每日决策仪表盘</span>
              <span className="ml-2">| 3-5分钟掌握今日要点</span>
            </div>
            <div className="flex items-center gap-4">
              <span>数据每日更新</span>
              <span>•</span>
              <span>Built with Data Punk Style</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
