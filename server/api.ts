import { Router } from "express";
import cache from "./cache.js";
import * as mockData from "./mockData.js";

const router = Router();

/**
 * Helper function to get data with fallback strategy:
 * 1. Try to get from cache
 * 2. If cache miss, use mock data
 * 3. Cache the result
 */
function getWithFallback<T>(
  cacheKey: string,
  mockDataFn: () => T,
  ttlSeconds: number = 3600
): T {
  // Try to get from cache
  let data = cache.get<T>(cacheKey);

  if (!data) {
    // Cache miss, use mock data
    data = mockDataFn();
    // Cache the result
    cache.set(cacheKey, data, ttlSeconds);
  }

  return data;
}

// Finance endpoints
router.get("/api/finance/overview", (_req, res) => {
  const data = getWithFallback(
    "finance:overview",
    () => mockData.mockFinanceOverview,
    300 // 5 minutes TTL
  );
  res.json(data);
});

router.get("/api/finance/videos", (_req, res) => {
  const data = getWithFallback(
    "finance:videos",
    () => mockData.mockFinanceVideos,
    7200 // 2 hours TTL
  );
  res.json(data);
});

router.get("/api/finance/breaking-news", (_req, res) => {
  const data = getWithFallback(
    "finance:breaking_news",
    () => mockData.mockBreakingNews,
    900 // 15 minutes TTL
  );
  res.json(data);
});

// Industry news endpoints
router.get("/api/industry-news", (_req, res) => {
  const data = getWithFallback(
    "industry:news",
    () => mockData.mockIndustryNews,
    3600 // 1 hour TTL
  );
  res.json(data);
});

router.get("/api/industry-news/videos", (_req, res) => {
  const data = getWithFallback(
    "industry:videos",
    () => mockData.mockIndustryVideos,
    7200 // 2 hours TTL
  );
  res.json(data);
});

// Food endpoints
router.get("/api/food/chinese", (req, res) => {
  const lat = req.query.lat as string;
  const lng = req.query.lng as string;

  // Use location-based cache key if lat/lng provided
  const cacheKey = lat && lng 
    ? `food:chinese:${lat}:${lng}` 
    : "food:chinese:default";

  const data = getWithFallback(
    cacheKey,
    () => mockData.mockChineseRestaurants,
    21600 // 6 hours TTL
  );
  res.json(data);
});

router.get("/api/food/bubble-tea", (req, res) => {
  const lat = req.query.lat as string;
  const lng = req.query.lng as string;

  // Use location-based cache key if lat/lng provided
  const cacheKey = lat && lng 
    ? `food:bubble_tea:${lat}:${lng}` 
    : "food:bubble_tea:default";

  const data = getWithFallback(
    cacheKey,
    () => mockData.mockBubbleTeaShops,
    21600 // 6 hours TTL
  );
  res.json(data);
});

// Entertainment endpoints
router.get("/api/entertainment/shows", (_req, res) => {
  const data = getWithFallback(
    "entertainment:shows",
    () => mockData.mockShows,
    43200 // 12 hours TTL
  );
  res.json(data);
});

router.get("/api/entertainment/gossip", (_req, res) => {
  const data = getWithFallback(
    "entertainment:gossip",
    () => mockData.mockGossip,
    3600 // 1 hour TTL
  );
  res.json(data);
});

// Deals endpoint
router.get("/api/deals", (_req, res) => {
  // Use date-based cache key
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `deals:${today}`;

  const data = getWithFallback(
    cacheKey,
    () => mockData.mockDeals,
    14400 // 4 hours TTL
  );
  res.json(data);
});

// Health check endpoint
router.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    cache: "sqlite",
  });
});

export default router;
