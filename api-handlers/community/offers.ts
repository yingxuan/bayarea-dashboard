export const runtime = "nodejs";

import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
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
const FETCH_TIMEOUT = 10000;
const RSS_FETCH_TIMEOUT = 5000;
const ONEPOINT3ACRES_FORUM_URL = "https://www.1point3acres.com/bbs/forum.php?gid=38";
const HN_FETCH_TIMEOUT = 5000;
const HN_ITEM_FETCH_TIMEOUT = 4000;
const HN_TARGET_COUNT = 6;
const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const HN_LIST_ENDPOINTS = ["askstories", "jobstories", "newstories"] as const;
const RSSHUB_INSTANCES = [
  "https://rsshub.app/1point3acres/section/38",
  "https://rsshub.rssforever.com/1point3acres/section/38",
  "https://rsshub.uneasy.win/1point3acres/section/38",
];
const FALLBACK_SEED: OfferItem[] = [
  {
    title: "Anthropic reference check怎么整？",
    url: "https://www.1point3acres.com/bbs/thread-1165641-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "job",
  },
  {
    title: "发个Meta E6中规中矩包攒RP",
    url: "https://www.1point3acres.com/bbs/thread-1168654-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "offer",
  },
  {
    title: "求instacart DS intern面经",
    url: "https://www.1point3acres.com/bbs/thread-1168425-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "interview",
  },
  {
    title: "求助人类学system design q4",
    url: "https://www.1point3acres.com/bbs/thread-1167042-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "interview",
  },
  {
    title: "人类学店面Q1是什么？",
    url: "https://www.1point3acres.com/bbs/thread-1167065-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "interview",
  },
  {
    title: "TikTok 北美内推｜Seattle/San Jose 全栈算法岗直推，HC 充足 + 直达 HM，速投！",
    url: "https://www.1point3acres.com/bbs/thread-1167964-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "job",
  },
  {
    title: "googleL4全流程",
    url: "https://www.1point3acres.com/bbs/thread-1168711-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "job",
  },
  {
    title: "Paypal Agentic AI 能去吗",
    url: "https://www.1point3acres.com/bbs/thread-1165761-1-1.html",
    source: "1point3acres",
    sourceLabel: "1Point3Acres",
    category: "job",
  },
];

interface OfferItem {
  title: string;
  url: string;
  source: "1point3acres" | "hackernews";
  sourceLabel: "1Point3Acres" | "Hacker News";
  publishedAt?: string;
  category: "offer" | "interview" | "job";
}

const TITLE_PATTERNS = [
  { pattern: /(offer|compensation|salary|tc|包裹|总包|白菜|涨薪|谈包)/i, category: "offer" as const },
  { pattern: /(面经|interview|onsite|vo\b|phone screen|oa\b|店面|电面)/i, category: "interview" as const },
  { pattern: /(跳槽|求职|内推|找工|hiring|recruit|recruiting|refer|referral)/i, category: "job" as const },
];

function normalize1p3aUrl(url: string): string {
  const instantMatch = url.match(/instant\.1point3acres\.com\/thread\/(\d+)/i);
  if (instantMatch) {
    return `https://www.1point3acres.com/bbs/thread-${instantMatch[1]}-1-1.html`;
  }

  const redirectMatch = url.match(/forum\.php\?mod=redirect&tid=(\d+)/i) || url.match(/tid=(\d+)/i);
  if (redirectMatch && url.includes("viewthread")) {
    return `https://www.1point3acres.com/bbs/thread-${redirectMatch[1]}-1-1.html`;
  }

  return url;
}

function absolute1p3aUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://www.1point3acres.com${href}`;
  return `https://www.1point3acres.com/bbs/${href.replace(/^\.?\//, "")}`;
}

function isValidThreadUrl(url: string): boolean {
  const normalized = normalize1p3aUrl(url).toLowerCase();
  if (
    normalized.includes("forumdisplay") ||
    normalized.includes("forum.php?gid=") ||
    normalized.includes("/forum-")
  ) {
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

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/^\[[^\]]+\]\s*/, "").trim();
}

function shouldKeepTitle(title: string): boolean {
  if (!title || title.length < 4) return false;
  if (/^\d+$/.test(title)) return false;
  if (/^(上一页|下一页|回复|查看|最新|更多)$/i.test(title)) return false;
  return true;
}

function pushOfferItem(
  items: OfferItem[],
  seenUrls: Set<string>,
  title: string,
  href: string,
  publishedAt: string,
  source: OfferItem["source"] = "1point3acres",
): void {
  if (items.length >= 12 || !href) return;

  const normalizedTitle = normalizeTitle(title);
  if (!shouldKeepTitle(normalizedTitle)) return;

  const url = normalize1p3aUrl(absolute1p3aUrl(href));
  if (!isValidThreadUrl(url) || seenUrls.has(url)) return;

  seenUrls.add(url);
  items.push({
    title: normalizedTitle,
    url,
    source,
    sourceLabel: source === "hackernews" ? "Hacker News" : "1Point3Acres",
    publishedAt,
    category: detectCategory(normalizedTitle),
  });
}

function mergeItems(primary: OfferItem[], fallback: OfferItem[], maxItems = 12): OfferItem[] {
  const seenUrls = new Set<string>();
  const merged: OfferItem[] = [];

  for (const item of [...primary, ...fallback]) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    merged.push(item);
    if (merged.length >= maxItems) break;
  }

  return merged;
}

async function scrapeOffersFromHtml(): Promise<OfferItem[]> {
  const response = await fetch(ONEPOINT3ACRES_FORUM_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
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

  const selectors = [
    "#portal_block_531_content a[href*='thread-']",
    ".forum-thread-tab a[href*='thread-']",
    "#diy3 a[href*='thread-']",
    "a.xi2[href*='thread-']",
    "a.xst[href*='thread-']",
    "a[href*='viewthread']",
    "a[href*='instant.1point3acres.com/thread/']",
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const href = ($(element).attr("href") || "").trim();
      const title = $(element).text().trim();
      pushOfferItem(items, seenUrls, title, href, fetchedAt);
      if (items.length >= 12) return false;
      return;
    });

    if (items.length >= 8) break;
  }

  return items;
}

async function fetchOffersViaRss(fetchedAt: string): Promise<OfferItem[]> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  });

  for (const instanceUrl of RSSHUB_INSTANCES) {
    try {
      const response = await fetch(instanceUrl, {
        headers: { "User-Agent": "BayAreaDashboard/1.0" },
        signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT),
      });
      if (!response.ok) continue;

      const xmlText = await response.text();
      if (!xmlText.includes("<rss") && !xmlText.includes("<feed")) continue;

      const parsed = parser.parse(xmlText);
      const rawItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
      const rssItems = Array.isArray(rawItems) ? rawItems : [rawItems];
      const seenUrls = new Set<string>();
      const items: OfferItem[] = [];

      for (const item of rssItems) {
        const title = typeof item.title === "string" ? item.title : item.title?.["#text"] || "";
        const link =
          typeof item.link === "string" ? item.link : item.link?.["#text"] || item.link?.["@_href"] || "";
        const publishedAt = item.pubDate?.["#text"] || item.pubDate || fetchedAt;

        pushOfferItem(items, seenUrls, title.trim(), String(link).trim(), publishedAt);
        if (items.length >= 12) break;
      }

      if (items.length >= 3) {
        return items;
      }
    } catch {
      // try next instance
    }
  }

  return [];
}

async function fetchHnDiscussions(fetchedAt: string): Promise<OfferItem[]> {
  const items: OfferItem[] = [];
  const seenUrls = new Set<string>();
  const strongMatchPattern =
    /(who is hiring|hiring|hire me|job search|job hunt|interview|onsite|phone screen|reference check|offer|salary|compensation|layoff|laid off|recruiter|negotiat)/i;
  const weakRejectPattern =
    /(career advice|career path|management|startup hiring freeze|fundraising|industry trend|how to manage|leadership|productivity)/i;

  for (const endpoint of HN_LIST_ENDPOINTS) {
    try {
      const response = await fetch(`${HN_API_BASE}/${endpoint}.json`, {
        signal: AbortSignal.timeout(HN_FETCH_TIMEOUT),
      });
      if (!response.ok) continue;

      const ids: number[] = ((await response.json()) || []).slice(0, 30);
      for (const id of ids) {
        if (items.length >= HN_TARGET_COUNT) return items;

        try {
          const itemResp = await fetch(`${HN_API_BASE}/item/${id}.json`, {
            signal: AbortSignal.timeout(HN_ITEM_FETCH_TIMEOUT),
          });
          if (!itemResp.ok) continue;

          const item = await itemResp.json();
          const title = (item?.title || "").trim();
          if (!title || !strongMatchPattern.test(title) || weakRejectPattern.test(title)) continue;
          if (typeof item?.type === "string" && item.type !== "story") continue;
          if (typeof item?.dead === "boolean" && item.dead) continue;
          if (typeof item?.deleted === "boolean" && item.deleted) continue;

          const url =
            typeof item?.url === "string" && item.url.startsWith("http")
              ? item.url
              : `https://news.ycombinator.com/item?id=${item?.id}`;
          const publishedAt =
            typeof item?.time === "number" ? new Date(item.time * 1000).toISOString() : fetchedAt;

          pushOfferItem(items, seenUrls, title, url, publishedAt, "hackernews");
        } catch {
          // try next item
        }
      }
    } catch {
      // try next endpoint
    }
  }

  return items;
}

async function fetchOffersData(
  nocache = false,
): Promise<{ items: OfferItem[]; sourceMode: "live" | "cache" | "seed" | "unavailable" }> {
  const cacheKey = "community-offers";

  if (!nocache) {
    const cached = getCachedData(cacheKey, OFFERS_CACHE_TTL, false);
    if (cached && cached.data?.items?.length >= 3) {
      return { items: cached.data.items, sourceMode: "cache" };
    }
  }

  try {
    const fetchedAt = new Date().toISOString();

    const rssItems = await fetchOffersViaRss(fetchedAt);
    if (rssItems.length >= 3) {
      const hnItems = await fetchHnDiscussions(fetchedAt);
      const merged = mergeItems(rssItems, hnItems);
      setCache(cacheKey, { items: merged, sourceMode: "live" });
      return { items: merged, sourceMode: "live" };
    }

    const htmlItems = await scrapeOffersFromHtml();
    if (htmlItems.length >= 3) {
      const hnItems = await fetchHnDiscussions(fetchedAt);
      const merged = mergeItems(htmlItems, hnItems);
      setCache(cacheKey, { items: merged, sourceMode: "live" });
      return { items: merged, sourceMode: "live" };
    }
  } catch (error) {
    console.warn("[Offers] Live fetch failed:", error instanceof Error ? error.message : error);
  }

  const stale = getStaleCache(cacheKey);
  if (stale && stale.data?.items?.length >= 3) {
    return { items: stale.data.items, sourceMode: "cache" };
  }

  if (FALLBACK_SEED.length >= 3) {
    try {
      const hnItems = await fetchHnDiscussions(new Date().toISOString());
      return { items: mergeItems(FALLBACK_SEED, hnItems), sourceMode: "seed" };
    } catch {
      return { items: FALLBACK_SEED, sourceMode: "seed" };
    }
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
