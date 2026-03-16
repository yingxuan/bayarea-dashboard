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

async function fetchHousingSearchViaApi(windowDays: number, limit: number, apiKey: string) {
  const publishedAfter = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("maxResults", String(Math.min(limit * 2, 16)));
  searchUrl.searchParams.set("publishedAfter", publishedAfter);
  searchUrl.searchParams.set("q", "湾区最新地产");
  searchUrl.searchParams.set("regionCode", "US");
  searchUrl.searchParams.set("relevanceLanguage", "zh-Hans");
  searchUrl.searchParams.set("key", apiKey);

  const response = await fetch(searchUrl.toString());
  if (!response.ok) {
    throw new Error(`youtube search ${response.status}`);
  }

  const result = await response.json();
  return (result.items || [])
    .map((item: any) => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      if (!videoId || !snippet?.publishedAt) return null;

      const title = String(snippet.title || "");
      if (/shorts/i.test(title)) return null;

      return {
        videoId,
        title,
        channelId: snippet.channelId || "",
        channelTitle: snippet.channelTitle || "YouTube",
        publishedAt: snippet.publishedAt,
        thumbnail:
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        durationSec: null,
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

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
          ? await fetchHousingSearchViaApi(windowDays, maxTotal, apiKey!)
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
