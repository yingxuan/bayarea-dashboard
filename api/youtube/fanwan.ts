import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  fetchFanwanViaApi,
  fetchFanwanViaRss,
} from "../../lib/youtube/fanwan.js";

const WINDOW_DAYS = 14;
const MAX_TOTAL = 18;
const CACHE_TTL_MS = 45 * 60 * 1000;

type CacheState = {
  updatedAt: string;
  source: "api" | "rss";
  data: {
    updatedAt: string;
    windowDays: number;
    source: "api" | "rss";
    videos: any[];
  };
};

const cache: { state?: CacheState } = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=900");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.YOUTUBE_API_KEY;
  const source: "api" | "rss" = apiKey ? "api" : "rss";
  const cacheKeySource = source;

  const now = Date.now();
  if (cache.state && cache.state.source === cacheKeySource && now - new Date(cache.state.updatedAt).getTime() < CACHE_TTL_MS) {
    return res.status(200).json(cache.state.data);
  }

  try {
    const videos =
      source === "api"
        ? await fetchFanwanViaApi(WINDOW_DAYS, MAX_TOTAL, apiKey!)
        : await fetchFanwanViaRss(WINDOW_DAYS, MAX_TOTAL);

    const response = {
      updatedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      source,
      videos: videos.slice(0, MAX_TOTAL),
    };

    cache.state = { updatedAt: response.updatedAt, source, data: response };
    return res.status(200).json(response);
  } catch (error: any) {
    console.error("[fanwan] error", error);
    return res.status(500).json({ error: "fetch failed", message: error?.message });
  }
}
