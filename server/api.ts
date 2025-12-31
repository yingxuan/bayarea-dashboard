import { Router } from "express";
import cache from "./cache.js";
import * as mockData from "./mockData.js";
import {
  getMultipleStockQuotes,
  getCryptoQuote,
  calculatePortfolio,
  type PortfolioHolding,
} from "./yahooFinance.js";

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

// Finance endpoints - Real-time stock data
router.get("/api/finance/overview", async (_req, res) => {
  try {
    // Try to get from cache first
    const cached = cache.get("finance:overview");
    if (cached) {
      return res.json(cached);
    }

    // Define user's portfolio (in production, this would come from database)
    const portfolio: PortfolioHolding[] = [
      { symbol: "AAPL", shares: 50, costBasis: 150 },
      { symbol: "GOOGL", shares: 30, costBasis: 120 },
      { symbol: "MSFT", shares: 40, costBasis: 300 },
      { symbol: "NVDA", shares: 20, costBasis: 400 },
      { symbol: "TSLA", shares: 15, costBasis: 200 },
    ];

    // Calculate portfolio summary
    const portfolioSummary = await calculatePortfolio(portfolio);

    // Get market indices
    const indices = await getMultipleStockQuotes(["SPY", "GC=F", "^TNX"]);
    const btc = await getCryptoQuote("BTC");

    // Calculate mortgage rate (using 10-year treasury + spread)
    const treasuryRate = indices["^TNX"]?.price || 4.5;
    const mortgageRate = (treasuryRate + 2.375) / 100; // Add typical spread

    const data = {
      stockMarketValue: {
        value: Math.round(portfolioSummary.totalValue),
        currency: "USD",
      },
      todayChange: {
        amount: Math.round(portfolioSummary.dayChange),
        percentage: Number(portfolioSummary.dayChangePercent.toFixed(2)),
      },
      totalGainLoss: {
        amount: Math.round(portfolioSummary.totalGain),
        percentage: Number(portfolioSummary.totalGainPercent.toFixed(2)),
      },
      ytd: {
        percentage: Number(portfolioSummary.totalGainPercent.toFixed(2)),
      },
      indices: [
        {
          code: "SPY",
          name: "S&P 500 ETF",
          value: Number(indices["SPY"]?.price.toFixed(2)) || 478.32,
          change: Number(indices["SPY"]?.change.toFixed(2)) || 1.25,
          changePercent: Number(indices["SPY"]?.changePercent.toFixed(2)) || 0.26,
        },
        {
          code: "GOLD",
          name: "Gold",
          value: Number(indices["GC=F"]?.price.toFixed(1)) || 2078.5,
          change: Number(indices["GC=F"]?.change.toFixed(1)) || -5.3,
          changePercent: Number(indices["GC=F"]?.changePercent.toFixed(2)) || -0.25,
        },
        {
          code: "BTC",
          name: "Bitcoin",
          value: Math.round(btc?.price || 42350),
          change: Math.round(btc?.change || 850),
          changePercent: Number(btc?.changePercent.toFixed(2)) || 2.05,
        },
        {
          code: "CA_JUMBO_ARM",
          name: "California Jumbo Loan 7/1 ARM",
          value: Number(mortgageRate.toFixed(3)),
          change: -0.125,
          changePercent: -1.79,
        },
        {
          code: "POWERBALL",
          name: "Powerball Jackpot",
          value: 485000000,
          change: 0,
          changePercent: 0,
        },
      ],
    };

    // Cache for 5 minutes
    cache.set("finance:overview", data, 300);
    res.json(data);
  } catch (error) {
    console.error("Error fetching finance overview:", error);
    // Fallback to mock data on error
    const fallbackData = mockData.mockFinanceOverview;
    res.json(fallbackData);
  }
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
