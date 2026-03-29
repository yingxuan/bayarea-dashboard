import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ttlMsToSeconds } from "../../shared/config.js";
import {
  getCachedData,
  getStaleCache,
  handleOptions,
  isCacheBypass,
  setCache,
  setCorsHeaders,
} from "../../lib/api-utils.js";
import { fetchJobsData } from "../community/jobs.js";
import { fetchOffersData } from "../community/offers.js";
import { fetchStartupNewsData } from "./startup-news.js";

const JOB_MARKET_TREND_CACHE_TTL = 30 * 60 * 1000;

interface TrendPoint {
  date: string;
  layoff: number;
  offer: number;
  startup: number;
}

function getLaDateKey(dateLike: string | number | Date): string {
  return new Date(dateLike).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

function buildEmptySeries(days: number): TrendPoint[] {
  const points: TrendPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    points.push({
      date: getLaDateKey(d),
      layoff: 0,
      offer: 0,
      startup: 0,
    });
  }

  return points;
}

export async function fetchJobMarketTrendData(
  nocache = false,
  days = 7,
): Promise<{ items: TrendPoint[]; sourceMode: "live" | "cache" | "unavailable" }> {
  const cacheKey = `job-market-trend:${days}`;

  if (!nocache) {
    const cached = getCachedData(cacheKey, JOB_MARKET_TREND_CACHE_TTL, false);
    if (cached && cached.data?.items?.length > 0) {
      return { items: cached.data.items, sourceMode: "cache" };
    }
  }

  const [jobsResult, offersResult, startupResult] = await Promise.all([
    fetchJobsData(nocache),
    fetchOffersData(nocache),
    fetchStartupNewsData(nocache),
  ]);

  const series = buildEmptySeries(days);
  const byDate = new Map(series.map((point) => [point.date, point]));

  for (const item of jobsResult.items) {
    if (item.category !== "layoff" || !item.publishedAt) continue;
    const key = getLaDateKey(item.publishedAt);
    const point = byDate.get(key);
    if (point) point.layoff += 1;
  }

  for (const item of offersResult.items) {
    if (!item.publishedAt) continue;
    const key = getLaDateKey(item.publishedAt);
    const point = byDate.get(key);
    if (point) point.offer += 1;
  }

  for (const item of startupResult.items) {
    if (!item.publishedAt) continue;
    const key = getLaDateKey(item.publishedAt);
    const point = byDate.get(key);
    if (point) point.startup += 1;
  }

  const hasSignal = series.some((item) => item.layoff || item.offer || item.startup);
  if (hasSignal) {
    setCache(cacheKey, { items: series, sourceMode: "live" });
    return { items: series, sourceMode: "live" };
  }

  const stale = getStaleCache(cacheKey);
  if (stale && stale.data?.items?.length > 0) {
    return { items: stale.data.items, sourceMode: "cache" };
  }

  return { items: series, sourceMode: "unavailable" };
}

export async function handleJobMarketTrend(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  try {
    const nocache = isCacheBypass(req);
    const daysRaw = Number(req.query.days || 7);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 5), 14) : 7;
    const fetchedAt = new Date().toISOString();
    const { items, sourceMode } = await fetchJobMarketTrendData(nocache, days);

    const latest = items[items.length - 1] || { layoff: 0, offer: 0, startup: 0 };
    const previous = items[items.length - 2] || { layoff: 0, offer: 0, startup: 0 };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json({
      status: items.length > 0 ? "ok" : "unavailable",
      days,
      items,
      latest,
      deltas: {
        layoff: latest.layoff - previous.layoff,
        offer: latest.offer - previous.offer,
        startup: latest.startup - previous.startup,
      },
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(JOB_MARKET_TREND_CACHE_TTL),
      sourceMode,
    });
  } catch (error) {
    console.error("[API /api/job-market-trend] Error:", error);
    res.status(200).json({
      status: "unavailable",
      days: 7,
      items: buildEmptySeries(7),
      latest: { layoff: 0, offer: 0, startup: 0 },
      deltas: { layoff: 0, offer: 0, startup: 0 },
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: "unavailable",
    });
  }
}

export default handleJobMarketTrend;
