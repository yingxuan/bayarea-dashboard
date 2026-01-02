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
import NewsList from "@/components/NewsList";
import FoodGrid from "@/components/FoodGrid";
import DealsGrid from "@/components/DealsGrid";
import GossipList from "@/components/GossipList";
import ShowsCard from "@/components/ShowsCard";
import YouTubersList from "@/components/YouTubersList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { config } from "@/config";

export default function Home() {
  const [industryNews, setIndustryNews] = useState<any>(null);
  const [chineseRestaurants, setChineseRestaurants] = useState<any>(null);
  const [shows, setShows] = useState<any>(null);
  const [gossip, setGossip] = useState<any>(null);
  const [deals, setDeals] = useState<any>(null);
  const [youtubers, setYouTubers] = useState<any>(null);
  const [techYoutubers, setTechYouTubers] = useState<any>(null);
  const [showLifestyle, setShowLifestyle] = useState(false);

  useEffect(() => {
    // Fetch all real data from APIs
    async function loadAllData() {
      // AI News
      try {
        const apiUrl = `${config.apiBaseUrl}/api/ai-news`;
        const response = await fetch(apiUrl);
        if (response.ok) {
          const result = await response.json();
          // Support both new (items) and legacy (news) format
          const newsItems = result.items || result.news || [];
          console.log(`[Home] AI News fetched: ${newsItems.length} items`, {
            status: result.status,
            hasItems: !!result.items,
            hasNews: !!result.news,
            apiUrl,
          });
          setIndustryNews({ news: newsItems });
        } else {
          console.error(`[Home] AI News API error: ${response.status} ${response.statusText}`);
          setIndustryNews({ news: [] });
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
          // Support both new (items) and legacy (gossip) format
          const items = result.items || result.gossip || [];
          setGossip(items.length > 0 ? { posts: items } : null);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch gossip:", error);
        setGossip(null);
      }

      // Deals (Reddit)
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/deals`);
        if (response.ok) {
          const result = await response.json();
          // Support both new (items) and legacy (deals) format
          const items = result.items || result.deals || [];
          setDeals(items.length > 0 ? { deals: items } : null);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch deals:", error);
        setDeals(null);
      }

      // YouTubers (Stock)
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtubers?category=stock&nocache=1`);
        if (response.ok) {
          const result = await response.json();
          // Support both new (items) and legacy (youtubers) format
          const items = result.items || result.youtubers || [];
          console.log("[Home] Stock youtubers fetched:", items.length, "items");
          setYouTubers(items.length > 0 ? { youtubers: items } : null);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch youtubers:", error);
        setYouTubers(null);
      }

      // Tech YouTubers
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtubers?category=tech&nocache=1`);
        if (response.ok) {
          const result = await response.json();
          // Support both new (items) and legacy (youtubers) format
          const items = result.items || result.youtubers || [];
          console.log("[Home] Tech youtubers fetched:", items.length, "items");
          setTechYouTubers(items.length > 0 ? { youtubers: items } : null);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch tech youtubers:", error);
        setTechYouTubers(null);
      }

    }
    
    loadAllData();
    // Refresh every 30 minutes
    const interval = setInterval(loadAllData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Check if any lifestyle modules have data
  const hasLifestyleData = 
    (chineseRestaurants && chineseRestaurants.restaurants && chineseRestaurants.restaurants.length > 0) ||
    (shows && shows.shows && shows.shows.length > 0) ||
    (gossip && gossip.posts && gossip.posts.length > 0) ||
    (deals && deals.deals && deals.deals.length > 0);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="container py-6">
        {/* First Screen: Core Blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-start">
          {/* Block 1: Asset Summary (Left, fixed on first screen) */}
          <div className="lg:col-span-1">
            <FinanceOverview />
          </div>

          {/* Block 2: Market-moving News (Center, main area) */}
          <div className="lg:col-span-1">
            {industryNews && industryNews.news && industryNews.news.length > 0 ? (
              <div>
                <div className="mb-3">
                  <h2 className="text-lg font-bold font-mono flex items-center gap-2 mb-1">
                    <span className="neon-text-blue">市场要闻</span>
                    <span className="text-muted-foreground text-sm">
                      | Market-moving News
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground font-mono">
                    今天影响钱和工作的科技要闻
                  </p>
                </div>
                <NewsList news={industryNews.news} maxItems={5} showTags={true} />
              </div>
            ) : (
              <div className="glow-border rounded-sm p-4 bg-card">
                <div className="text-sm text-muted-foreground font-mono">
                  市场要闻暂不可用
                </div>
              </div>
            )}
          </div>

          {/* Block 3: Videos (Right, with Tabs) */}
          <div className="lg:col-span-1">
            <div className="mb-3">
              <h2 className="text-lg font-bold font-mono flex items-center gap-2 mb-1">
                <span className="neon-text-blue">视频</span>
                <span className="text-muted-foreground text-sm">
                  | Videos
                </span>
              </h2>
            </div>
            <Tabs defaultValue="stock" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="stock">美股博主</TabsTrigger>
                <TabsTrigger value="tech">硅谷科技圈</TabsTrigger>
              </TabsList>
              <TabsContent value="stock" className="mt-0">
                {youtubers && youtubers.youtubers && youtubers.youtubers.length > 0 ? (
                  <div>
                    <div className="mb-3">
                      <h3 className="text-base font-semibold font-mono text-foreground/90 mb-1">
                        美股博主
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        最新视频更新
                      </p>
                    </div>
                    <YouTubersList items={youtubers.youtubers} maxItems={5} />
                  </div>
                ) : (
                  <div className="glow-border rounded-sm p-4 bg-card">
                    <div className="text-sm text-muted-foreground font-mono text-center py-8">
                      暂无更新
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="tech" className="mt-0">
                {techYoutubers && techYoutubers.youtubers && techYoutubers.youtubers.length > 0 ? (
                  <div>
                    <div className="mb-3">
                      <h3 className="text-base font-semibold font-mono text-foreground/90 mb-1">
                        硅谷科技圈
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">
                        最新视频更新
                      </p>
                    </div>
                    <YouTubersList items={techYoutubers.youtubers} maxItems={5} />
                  </div>
                ) : (
                  <div className="glow-border rounded-sm p-4 bg-card">
                    <div className="text-sm text-muted-foreground font-mono text-center py-8">
                      暂无更新
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Second Screen: Lifestyle Modules (Collapsible) */}
        {hasLifestyleData && (
          <div className="border-t border-border pt-8">
            <button
              onClick={() => setShowLifestyle(!showLifestyle)}
              className="w-full flex items-center justify-between mb-4 p-3 glow-border rounded-sm bg-card hover:bg-card/80 transition-colors"
            >
              <h2 className="text-lg font-bold font-mono flex items-center gap-2">
                <span className="neon-text-blue">生活</span>
                <span className="text-muted-foreground text-sm">
                  | Lifestyle
                </span>
              </h2>
              <span className="text-sm text-muted-foreground font-mono">
                {showLifestyle ? "收起" : "展开"}
              </span>
            </button>

            {showLifestyle && (
              <div className="space-y-8">
                {/* Food Section */}
                {chineseRestaurants && chineseRestaurants.restaurants && chineseRestaurants.restaurants.length > 0 && (
                  <section>
                    <h3 className="text-base font-semibold mb-3 font-mono text-foreground/90">
                      中餐推荐 <span className="text-muted-foreground text-sm">10 miles</span>
                    </h3>
                    <FoodGrid
                      places={chineseRestaurants.restaurants}
                      maxItems={4}
                      showCuisine={true}
                    />
                  </section>
                )}

                {/* Shows Section */}
                {shows && shows.shows && shows.shows.length > 0 && (
                  <section>
                    <h3 className="text-base font-semibold mb-3 font-mono text-foreground/90">
                      追剧推荐
                    </h3>
                    <ShowsCard shows={shows.shows} maxItems={3} />
                  </section>
                )}

                {/* Gossip Section */}
                {gossip && gossip.posts && gossip.posts.length > 0 && (
                  <section>
                    <h3 className="text-base font-semibold mb-3 font-mono text-foreground/90">
                      吃瓜
                    </h3>
                    <GossipList posts={gossip.posts} maxItems={10} />
                  </section>
                )}

                {/* Deals Section */}
                {deals && deals.deals && deals.deals.length > 0 && (
                  <section>
                    <h3 className="text-base font-semibold mb-3 font-mono text-foreground/90">
                      遍地羊毛
                    </h3>
                    <DealsGrid deals={deals.deals} maxItems={12} />
                  </section>
                )}
              </div>
            )}
          </div>
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
