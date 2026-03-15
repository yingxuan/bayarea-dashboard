import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  fetchVideosViaApi,
  fetchVideosViaRss,
  fetchFanwanViaApi,
  fetchFanwanViaRss,
} from "../../lib/youtube/fanwan.js";
import { HOUSING_CHANNELS } from "../../lib/youtube/housingChannels.js";

const WINDOW_DAYS = 14;
const MAX_TOTAL = 18;
const CACHE_TTL_MS = 45 * 60 * 1000;

type CacheState = {
  updatedAt: string;
  source: "api" | "rss";
  feed: "fanwan" | "housing";
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

  const feed = req.query.feed === "housing" ? "housing" : "fanwan";
  const apiKey = process.env.YOUTUBE_API_KEY;
  const source: "api" | "rss" = apiKey ? "api" : "rss";
  const cacheKeySource = source;
  const windowDays = feed === "housing" ? 30 : WINDOW_DAYS;
  const maxTotal = feed === "housing" ? 6 : MAX_TOTAL;

  const now = Date.now();
  if (
    cache.state &&
    cache.state.source === cacheKeySource &&
    cache.state.feed === feed &&
    now - new Date(cache.state.updatedAt).getTime() < CACHE_TTL_MS
  ) {
    return res.status(200).json(cache.state.data);
  }

  try {
    const videos =
      feed === "housing"
        ? source === "api"
          ? await fetchVideosViaApi(HOUSING_CHANNELS, windowDays, maxTotal, apiKey!)
          : await fetchVideosViaRss(HOUSING_CHANNELS, windowDays, maxTotal)
        : source === "api"
          ? await fetchFanwanViaApi(windowDays, maxTotal, apiKey!)
          : await fetchFanwanViaRss(windowDays, maxTotal);

    const response = {
      updatedAt: new Date().toISOString(),
      windowDays,
      source,
      videos: videos.slice(0, maxTotal),
    };

    cache.state = { updatedAt: response.updatedAt, source, feed, data: response };
    return res.status(200).json(response);
  } catch (error: any) {
    console.error("[fanwan] error", error);
    return res.status(500).json({ error: "fetch failed", message: error?.message });
  }
}
