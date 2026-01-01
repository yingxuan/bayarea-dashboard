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
// Mock data removed - all sections now use real APIs
import { config } from "@/config";

export default function Home() {
  const [industryNews, setIndustryNews] = useState<any>(null);
  const [chineseRestaurants, setChineseRestaurants] = useState<any>(null);
  const [bubbleTeaShops, setBubbleTeaShops] = useState<any>(null);
  const [shows, setShows] = useState<any>(null);
  const [gossip, setGossip] = useState<any>(null);
  const [deals, setDeals] = useState<any>(null);

  useEffect(() => {
    // Fetch all real data from APIs
    async function loadAllData() {
      // AI News
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/ai-news`);
        if (response.ok) {
          const result = await response.json();
          console.log('[Home] AI news loaded:', result.news?.length || 0, 'items');
          setIndustryNews({ news: result.news || [] });
        }
      } catch (error) {
        console.error("[Home] Failed to fetch AI news:", error);
        setIndustryNews({ news: [] });
      }

      // Restaurants
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/restaurants`);
        if (response.ok) {
          const result = await response.json();
          console.log('[Home] Restaurants loaded:', result.restaurants?.length || 0, 'items');
          setChineseRestaurants(result.restaurants || []);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch restaurants:", error);
        setChineseRestaurants([]);
      }

      // TV Shows
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/shows`);
        if (response.ok) {
          const result = await response.json();
          console.log('[Home] Shows loaded:', result.shows?.length || 0, 'items');
          setShows(result.shows || []);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch shows:", error);
        setShows([]);
      }

      // Gossip (Hacker News)
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/gossip`);
        if (response.ok) {
          const result = await response.json();
          console.log('[Home] Gossip loaded:', result.gossip?.length || 0, 'items');
          setGossip(result.gossip || []);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch gossip:", error);
        setGossip([]);
      }

      // Deals (Reddit)
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/deals`);
        if (response.ok) {
          const result = await response.json();
          console.log('[Home] Deals loaded:', result.deals?.length || 0, 'items');
          setDeals(result.deals || []);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch deals:", error);
        setDeals([]);
      }

      // Bubble tea shops - keeping as empty for now (can add later)
      setBubbleTeaShops([]);
    }
    
    loadAllData();
    // Refresh every 30 minutes
    const interval = setInterval(loadAllData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="container py-6">
        {/* Finance Section */}
        <section className="mb-8">
          <FinanceOverview />
        </section>

        {/* Industry News */}
        {industryNews && industryNews.news && industryNews.news.length > 0 && (
          <section className="mb-8">
            <div className="mb-3">
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

        {/* Food Section */}
        {chineseRestaurants && chineseRestaurants.restaurants && chineseRestaurants.restaurants.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold font-mono mb-3 flex items-center gap-2">
              <span className="neon-text-blue">吃喝玩乐</span>
              <span className="text-muted-foreground text-sm">
                | 今天去哪吃
              </span>
            </h2>
            <div>
              <h3 className="text-base font-semibold mb-3 font-mono text-foreground/90">
                中餐推荐 <span className="text-muted-foreground text-sm">10 miles</span>
              </h3>
              <FoodGrid
                places={chineseRestaurants.restaurants}
                maxItems={4}
                showCuisine={true}
              />
            </div>
          </section>
        )}

        {/* Shows Section */}
        {shows && shows.shows && shows.shows.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold font-mono mb-3 flex items-center gap-2">
              <span className="neon-text-blue">追剧推荐</span>
              <span className="text-muted-foreground text-sm">
                | 下班后看什么
              </span>
            </h2>
            <ShowsCard shows={shows.shows} maxItems={3} />
          </section>
        )}

        {/* Gossip Section */}
        {gossip && gossip.posts && gossip.posts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold font-mono mb-3 flex items-center gap-2">
              <span className="neon-text-blue">吃瓜</span>
              <span className="text-muted-foreground text-sm">
                | 华人论坛热帖
              </span>
            </h2>
            <GossipList posts={gossip.posts} maxItems={10} />
          </section>
        )}

        {/* Deals Section */}
        {deals && deals.deals && deals.deals.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold font-mono mb-3 flex items-center gap-2">
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
