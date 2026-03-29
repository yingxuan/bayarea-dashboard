import type { VercelRequest, VercelResponse } from "@vercel/node";
import { XMLParser } from "fast-xml-parser";
import { ttlMsToSeconds } from "../../shared/config.js";
import {
  getCachedData,
  getStaleCache,
  handleOptions,
  isCacheBypass,
  setCache,
  setCorsHeaders,
} from "../../lib/api-utils.js";

const STARTUP_NEWS_CACHE_TTL = 30 * 60 * 1000;
const FETCH_TIMEOUT = 8000;

const STARTUP_RSS_QUERIES = [
  "https://news.google.com/rss/search?q=(bay+area+startup+funding+OR+silicon+valley+startup+funding+OR+san+francisco+startup+funding)+when:7d&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=(startup+hiring+bay+area+OR+startup+layoffs+bay+area)+when:7d&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=(y+combinator+startup+OR+series+a+startup+bay+area+OR+venture+capital+startup+san+francisco)+when:7d&hl=en-US&gl=US&ceid=US:en",
];

const STARTUP_FALLBACK_SEED: StartupNewsItem[] = [
  {
    title: "Crunchbase tracks startup funding and Bay Area venture activity",
    url: "https://news.crunchbase.com/",
    source: "Crunchbase News",
  },
  {
    title: "TechCrunch Startups coverage",
    url: "https://techcrunch.com/category/startups/",
    source: "TechCrunch",
  },
  {
    title: "Silicon Valley Business Journal startup coverage",
    url: "https://www.bizjournals.com/sanjose/",
    source: "SVBJ",
  },
];

interface StartupNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

function shouldKeepStartupTitle(title: string) {
  return /(startup|funding|raises|raised|venture|vc|seed|series a|series b|acquires|acquisition|yc|y combinator|layoff|hiring)/i.test(
    title,
  );
}

function normalizeStartupSource(raw: string) {
  if (/crunchbase/i.test(raw)) return "Crunchbase";
  if (/techcrunch/i.test(raw)) return "TechCrunch";
  if (/business journal/i.test(raw)) return "SVBJ";
  if (/google/i.test(raw)) return "Google News";
  return raw || "Startup Feed";
}

export async function fetchStartupNewsData(
  nocache = false,
): Promise<{ items: StartupNewsItem[]; sourceMode: "live" | "cache" | "seed" | "unavailable" }> {
  const cacheKey = "startup-news-v2";

  if (!nocache) {
    const cached = getCachedData(cacheKey, STARTUP_NEWS_CACHE_TTL, false);
    if (cached && cached.data?.items?.length > 0) {
      return { items: cached.data.items, sourceMode: "cache" };
    }
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
  });

  const items: StartupNewsItem[] = [];
  const seenUrls = new Set<string>();

  for (const rssUrl of STARTUP_RSS_QUERIES) {
    try {
      const resp = await fetch(rssUrl, {
        headers: { "User-Agent": "BayAreaDashboard/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!resp.ok) continue;

      const xml = await resp.text();
      const parsed = parser.parse(xml);
      const rawItems = parsed?.rss?.channel?.item;
      const feedItems = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

      for (const item of feedItems) {
        const title = String(item?.title || "").trim();
        const url = String(item?.link || "").trim();
        const source = normalizeStartupSource(
          String(item?.source?.["#text"] || item?.source || "Google News").trim(),
        );

        if (!title || !url || seenUrls.has(url) || !shouldKeepStartupTitle(title)) {
          continue;
        }

        seenUrls.add(url);
        items.push({
          title,
          url,
          source,
          publishedAt: item?.pubDate ? new Date(item.pubDate).toISOString() : undefined,
        });
      }
    } catch (error) {
      console.warn(
        "[Startup News] feed fetch failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const sortedItems = items
    .sort(
      (a, b) =>
        new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime(),
    )
    .slice(0, 12);

  if (sortedItems.length > 0) {
    setCache(cacheKey, { items: sortedItems, sourceMode: "live" });
    return { items: sortedItems, sourceMode: "live" };
  }

  const stale = getStaleCache(cacheKey);
  if (stale && stale.data?.items?.length > 0) {
    return { items: stale.data.items, sourceMode: "cache" };
  }

  if (STARTUP_FALLBACK_SEED.length > 0) {
    return { items: STARTUP_FALLBACK_SEED, sourceMode: "seed" };
  }

  return { items: [], sourceMode: "unavailable" };
}

export async function handleStartupNews(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  try {
    const nocache = isCacheBypass(req);
    const fetchedAt = new Date().toISOString();
    const { items, sourceMode } = await fetchStartupNewsData(nocache);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json({
      status: items.length > 0 ? "ok" : "unavailable",
      items,
      count: items.length,
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(STARTUP_NEWS_CACHE_TTL),
      sourceMode,
      source: { name: "Google News RSS + fallback startup publishers", url: STARTUP_RSS_QUERIES[0] },
    });
  } catch (error) {
    console.error("[API /api/startup-news] Error:", error);
    res.status(200).json({
      status: "unavailable",
      items: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: "unavailable",
      source: { name: "Google News RSS + fallback startup publishers", url: STARTUP_RSS_QUERIES[0] },
    });
  }
}

export default handleStartupNews;
