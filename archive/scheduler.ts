import cron from "node-cron";
import cache from "./cache.js";
import * as mockData from "./mockData.js";

/**
 * Scheduled tasks for updating cached data
 * In production, these would fetch real data from external APIs
 * For now, they refresh mock data to simulate updates
 */

// Update finance data every 5 minutes during market hours (9:30 AM - 4:00 PM ET)
cron.schedule("*/5 * * * *", () => {
  console.log("[Scheduler] Updating finance overview...");
  cache.set("finance:overview", mockData.mockFinanceOverview, 300);
});

// Update finance videos every 2 hours
cron.schedule("0 */2 * * *", () => {
  console.log("[Scheduler] Updating finance videos...");
  cache.set("finance:videos", mockData.mockFinanceVideos, 7200);
});

// Update breaking news every 15 minutes
cron.schedule("*/15 * * * *", () => {
  console.log("[Scheduler] Updating breaking news...");
  cache.set("finance:breaking_news", mockData.mockBreakingNews, 900);
});

// Update industry news every hour
cron.schedule("0 * * * *", () => {
  console.log("[Scheduler] Updating industry news...");
  cache.set("industry:news", mockData.mockIndustryNews, 3600);
});

// Update industry videos every 2 hours
cron.schedule("0 */2 * * *", () => {
  console.log("[Scheduler] Updating industry videos...");
  cache.set("industry:videos", mockData.mockIndustryVideos, 7200);
});

// Update deals every 4 hours
cron.schedule("0 */4 * * *", () => {
  console.log("[Scheduler] Updating deals...");
  const today = new Date().toISOString().split("T")[0];
  cache.set(`deals:${today}`, mockData.mockDeals, 14400);
});

// Update gossip every hour
cron.schedule("0 * * * *", () => {
  console.log("[Scheduler] Updating gossip...");
  cache.set("entertainment:gossip", mockData.mockGossip, 3600);
});

// Update restaurant data every 6 hours
cron.schedule("0 */6 * * *", () => {
  console.log("[Scheduler] Updating restaurant data...");
  cache.set("food:chinese:default", mockData.mockChineseRestaurants, 21600);
  cache.set("food:bubble_tea:default", mockData.mockBubbleTeaShops, 21600);
});

// Update shows every 12 hours
cron.schedule("0 */12 * * *", () => {
  console.log("[Scheduler] Updating shows...");
  cache.set("entertainment:shows", mockData.mockShows, 43200);
});

// Clean up expired cache entries every hour
cron.schedule("0 * * * *", () => {
  const deleted = cache.cleanExpired();
  if (deleted > 0) {
    console.log(`[Scheduler] Cleaned up ${deleted} expired cache entries`);
  }
});

console.log("[Scheduler] All scheduled tasks initialized");

export default {
  // Export for testing or manual triggering if needed
  tasks: {
    updateFinanceOverview: () => cache.set("finance:overview", mockData.mockFinanceOverview, 300),
    updateFinanceVideos: () => cache.set("finance:videos", mockData.mockFinanceVideos, 7200),
    updateBreakingNews: () => cache.set("finance:breaking_news", mockData.mockBreakingNews, 900),
    updateIndustryNews: () => cache.set("industry:news", mockData.mockIndustryNews, 3600),
    updateIndustryVideos: () => cache.set("industry:videos", mockData.mockIndustryVideos, 7200),
    updateDeals: () => {
      const today = new Date().toISOString().split("T")[0];
      cache.set(`deals:${today}`, mockData.mockDeals, 14400);
    },
    updateGossip: () => cache.set("entertainment:gossip", mockData.mockGossip, 3600),
    updateRestaurants: () => {
      cache.set("food:chinese:default", mockData.mockChineseRestaurants, 21600);
      cache.set("food:bubble_tea:default", mockData.mockBubbleTeaShops, 21600);
    },
    updateShows: () => cache.set("entertainment:shows", mockData.mockShows, 43200),
  },
};
