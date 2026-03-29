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

const LEEKS_CACHE_TTL = 20 * 60 * 1000;
const ONEPOINT3ACRES_FORUM_URL = "https://www.1point3acres.com/bbs/forum-291-1.html";
const JINA_PROXY_URL = `https://r.jina.ai/http://${ONEPOINT3ACRES_FORUM_URL}`;

interface CommunityItem {
  source: "1point3acres";
  sourceLabel: "一亩三分地";
  title: string;
  url: string;
  publishedAt?: string;
}

interface FetchLeekResult {
  items: CommunityItem[];
  sourceMode: "live" | "fallback" | "cache" | "unavailable";
  sourceName: "1point3acres-html" | "1point3acres-jina" | "cache" | "unavailable";
  fallbackUsed: boolean;
}

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
  if (normalized.includes("forumdisplay") || /forum-\d+-\d+(\.html)?$/.test(normalized)) {
    return false;
  }

  return (
    normalized.includes("/bbs/thread-") ||
    (normalized.includes("viewthread") && normalized.includes("tid=")) ||
    normalized.includes("instant.1point3acres.com/thread/")
  );
}

function buildAbsolute1p3aUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://www.1point3acres.com${href}`;
  return `https://www.1point3acres.com/bbs/${href}`;
}

function collectHtmlItems($: cheerio.CheerioAPI, fetchedAt: string): CommunityItem[] {
  const seenUrls = new Set<string>();
  const items: CommunityItem[] = [];
  const rowSelectors = [
    "tbody[id^='normalthread_']",
    "tbody[id^='stickthread_']",
    "div#threadlist table tbody[id]",
  ];

  for (const selector of rowSelectors) {
    $(selector).each((_, row) => {
      if (items.length >= 12) return false;

      const link = $(row).find("a.xst, a.s.xst, a[href*='thread-'], a[href*='viewthread']").first();
      if (!link.length) return;

      const title = link.text().trim();
      const href = link.attr("href") || "";
      if (!title || title.length < 4 || !href) return;

      const url = normalize1p3aUrl(buildAbsolute1p3aUrl(href));
      if (!isValidThreadUrl(url) || seenUrls.has(url)) return;

      seenUrls.add(url);
      items.push({
        source: "1point3acres",
        sourceLabel: "一亩三分地",
        title,
        url,
        publishedAt: fetchedAt,
      });
    });

    if (items.length > 0) {
      return items;
    }
  }

  $("a.xst, a[href*='thread-'], a[href*='viewthread'], a[href*='instant.1point3acres.com/thread/']").each(
    (_, element) => {
      if (items.length >= 12) return false;

      const title = $(element).text().trim();
      const href = $(element).attr("href") || "";
      if (!title || title.length < 4 || !href) return;

      const url = normalize1p3aUrl(buildAbsolute1p3aUrl(href));
      if (!isValidThreadUrl(url) || seenUrls.has(url)) return;

      seenUrls.add(url);
      items.push({
        source: "1point3acres",
        sourceLabel: "一亩三分地",
        title,
        url,
        publishedAt: fetchedAt,
      });
    },
  );

  return items;
}

async function scrapeForumTopPosts(): Promise<CommunityItem[]> {
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
  return collectHtmlItems($, fetchedAt);
}

async function scrapeForumTopPostsViaJina(): Promise<CommunityItem[]> {
  const response = await fetch(JINA_PROXY_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/plain,text/markdown;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Jina proxy returned ${response.status}`);
  }

  const fetchedAt = new Date().toISOString();
  const body = await response.text();
  const seenUrls = new Set<string>();
  const items: CommunityItem[] = [];
  const matches = body.matchAll(/\[(.+?)\]\((https?:\/\/[^\s)]+1point3acres[^\s)]*)\)/g);

  for (const match of matches) {
    if (items.length >= 12) break;
    const title = match[1]?.trim();
    const rawUrl = match[2]?.trim();
    if (!title || title.length < 4 || !rawUrl) continue;

    const url = normalize1p3aUrl(rawUrl);
    if (!isValidThreadUrl(url) || seenUrls.has(url)) continue;

    seenUrls.add(url);
    items.push({
      source: "1point3acres",
      sourceLabel: "一亩三分地",
      title,
      url,
      publishedAt: fetchedAt,
    });
  }

  return items;
}

async function fetchLeekData(nocache = false): Promise<FetchLeekResult> {
  const cacheKey = "community-leeks";

  if (!nocache) {
    const cached = getCachedData(cacheKey, LEEKS_CACHE_TTL, false);
    if (cached && cached.data?.items?.length >= 1) {
      return {
        items: cached.data.items,
        sourceMode: "cache",
        sourceName: "cache",
        fallbackUsed: Boolean(cached.data?.fallbackUsed),
      };
    }
  }

  try {
    const items = await scrapeForumTopPosts();
    if (items.length >= 1) {
      setCache(cacheKey, { items, sourceMode: "live", sourceName: "1point3acres-html", fallbackUsed: false });
      return { items, sourceMode: "live", sourceName: "1point3acres-html", fallbackUsed: false };
    }
    console.warn("[Leeks] HTML scrape returned 0 items");
  } catch (error) {
    console.warn("[Leeks] HTML scrape failed:", error instanceof Error ? error.message : error);
  }

  try {
    const items = await scrapeForumTopPostsViaJina();
    if (items.length >= 1) {
      setCache(cacheKey, { items, sourceMode: "fallback", sourceName: "1point3acres-jina", fallbackUsed: true });
      return { items, sourceMode: "fallback", sourceName: "1point3acres-jina", fallbackUsed: true };
    }
    console.warn("[Leeks] Jina fallback returned 0 items");
  } catch (error) {
    console.warn("[Leeks] Jina fallback failed:", error instanceof Error ? error.message : error);
  }

  const stale = getStaleCache(cacheKey);
  if (stale && stale.data?.items?.length >= 1) {
    return {
      items: stale.data.items,
      sourceMode: "cache",
      sourceName: "cache",
      fallbackUsed: Boolean(stale.data?.fallbackUsed),
    };
  }

  return { items: [], sourceMode: "unavailable", sourceName: "unavailable", fallbackUsed: false };
}

export async function handleLeeks(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  try {
    const nocache = isCacheBypass(req);
    const fetchedAt = new Date().toISOString();
    const { items, sourceMode, sourceName, fallbackUsed } = await fetchLeekData(nocache);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json({
      status: items.length > 0 ? "ok" : "unavailable",
      items,
      count: items.length,
      fetchedAt,
      ttlSeconds: ttlMsToSeconds(LEEKS_CACHE_TTL),
      sourceMode,
      sourceName,
      fallbackUsed,
      source: { name: "1point3acres", url: ONEPOINT3ACRES_FORUM_URL },
    });
  } catch (error) {
    console.error("[API /api/community/leeks] Error:", error);
    res.status(200).json({
      status: "unavailable",
      items: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: "unavailable",
      sourceName: "unavailable",
      fallbackUsed: false,
      source: { name: "1point3acres", url: ONEPOINT3ACRES_FORUM_URL },
    });
  }
}

export default handleLeeks;
