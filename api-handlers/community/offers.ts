export const runtime = "nodejs";

import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { ttlMsToSeconds } from "../../shared/config.js";
import {
  getCachedData,
  getStaleCache,
  handleOptions,
  isCacheBypass,
  setCache,
  setCorsHeaders,
} from "../../lib/api-utils.js";

const OFFERS_CACHE_TTL = 30 * 60 * 1000;
const ONEPOINT3ACRES_FORUM_URL = "https://www.1point3acres.com/bbs/forum.php?gid=38";

interface OfferItem {
  title: string;
  url: string;
  source: "1point3acres";
  sourceLabel: "一亩三分地";
  publishedAt?: string;
  category: "offer" | "interview" | "job";
}

const TITLE_PATTERNS = [
  { pattern: /(offer|compensation|salary|tc|包裹|总包|白菜)/i, category: "offer" as const },
  { pattern: /(面经|interview|onsite|vo\b|phone screen|oa\b)/i, category: "interview" as const },
  { pattern: /(跳槽|求职|内推|找工|hiring|recruit|recruiting)/i, category: "job" as const },
];

function normalize1p3aUrl(url: string): string {
  const instantMatch = url.match(/instant\.1point3acres\.com\/thread\/(\d+)/i);
  if (instantMatch) {
    return `https://www.1point3acres.com/bbs/thread-${instantMatch[1]}-1-1.html`;
  }

  const redirectMatch = url.match(/tid=(\d+)/i);
  if (redirectMatch && url.includes("viewthread")) {
    return `https://www.1point3acres.com/bbs/thread-${redirectMatch[1]}-1-1.html`;
  }

  return url;
}

function isValidThreadUrl(url: string): boolean {
  const normalized = normalize1p3aUrl(url).toLowerCase();
  if (normalized.includes("forumdisplay") || normalized.includes("forum.php?gid=")) {
    return false;
  }

  return (
    normalized.includes("/bbs/thread-") ||
    (normalized.includes("viewthread") && normalized.includes("tid=")) ||
    normalized.includes("instant.1point3acres.com/thread/")
  );
}

function detectCategory(title: string): OfferItem["category"] {
  for (const { pattern, category } of TITLE_PATTERNS) {
    if (pattern.test(title)) return category;
  }
  return "job";
}

async function scrapeOffersFromHtml(): Promise<OfferItem[]> {
  const response = await fetch(ONEPOINT3ACRES_FORUM_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`1P3A HTML returned ${response.status}`);
  }

  const fetchedAt = new Date().toISOString();
  const buf = await response.arrayBuffer();
  const html = iconv.decode(Buffer.from(buf), "gbk");
  const $ = cheerio.load(html);
  const seenUrls = new Set<string>();
  const items: OfferItem[] = [];

  $("a.xi2, a.xst, a[href*='/bbs/thread-'], a[href*='viewthread'], a[href*='instant.1point3acres.com/thread/']").each(
    (_, element) => {
      if (items.length >= 12) return false;

      const title = $(element).text().trim();
      const href = $(element).attr("href") || "";
      if (!title || title.length < 4 || !href) return;

      const absoluteUrl = href.startsWith("http")
        ? href
        : href.startsWith("/")
          ? `https://www.1point3acres.com${href}`
          : `https://www.1point3acres.com/bbs/${href}`;

      const url = normalize1p3aUrl(absoluteUrl);
      if (!isValidThreadUrl(url) || seenUrls.has(url)) return;

      seenUrls.add(url);
      items.push({
        title,
        url,
        source: "1point3acres",
        sourceLabel: "一亩三分地",
        publishedAt: fetchedAt,
        category: detectCategory(title),
      });
    },
  );

  return items;
}

async function fetchOffersData(
  nocache = false,
): Promise<{ items: OfferItem[]; sourceMode: "live" | "cache" | "unavailable" }> {
  const cacheKey = "community-offers";

  if (!nocache) {
    const cached = getCachedData(cacheKey, OFFERS_CACHE_TTL, false);
    if (cached && cached.data?.items?.length >= 3) {
      return { items: cached.data.items, sourceMode: "cache" };
    }
  }

  try {
    const htmlItems = await scrapeOffersFromHtml();
    if (htmlItems.length >= 3) {
      setCache(cacheKey, { items: htmlItems, sourceMode: "live" });
      return { items: htmlItems, sourceMode: "live" };
    }
  } catch (error) {
    console.warn("[Offers] HTML scrape failed:", error instanceof Error ? error.message : error);
  }

  const stale = getStaleCache(cacheKey);
  if (stale && stale.data?.items?.length >= 3) {
    return { items: stale.data.items, sourceMode: "cache" };
  }

  return { items: [], sourceMode: "unavailable" };
}

export async function handleOffers(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  try {
    const nocache = isCacheBypass(req);
    const fetchedAt = new Date().toISOString();
    const { items, sourceMode } = await fetchOffersData(nocache);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json({
      status: items.length > 0 ? "ok" : "unavailable",
      items,
      count: items.length,
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(OFFERS_CACHE_TTL),
      sourceMode,
      source: { name: "1point3acres", url: ONEPOINT3ACRES_FORUM_URL },
    });
  } catch (error) {
    console.error("[API /api/community/offers] Error:", error);
    res.status(200).json({
      status: "unavailable",
      items: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: "unavailable",
      source: { name: "1point3acres", url: ONEPOINT3ACRES_FORUM_URL },
    });
  }
}

export default handleOffers;
