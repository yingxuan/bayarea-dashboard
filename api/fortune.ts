import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
} from "./utils.js";
import { getFortuneCacheKey, getLosAngelesDateInfo } from "../lib/fortune/cache.js";
import { generateFortune } from "../lib/fortune/gemini.js";
import { fortuneResponseSchema } from "../lib/fortune/schema.js";
import { formatDateLA, normalizeYMD } from "../lib/fortune/date.js";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 30;

const rateLimitBuckets = new Map<string, { windowEnd: number; count: number }>();

function getIpAddress(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return "unknown";
}

function enforceRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now > bucket.windowEnd) {
    rateLimitBuckets.set(ip, {
      windowEnd: now + RATE_LIMIT_WINDOW_MS,
      count: 1,
    });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function normalizeBirthdate(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return normalizeYMD(value || "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Expires", "0");
  res.setHeader("Pragma", "no-cache");
  if (handleOptions(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getIpAddress(req);
  if (!enforceRateLimit(ip)) {
    return res.status(429).json({ error: "Rate limit exceeded (30 requests/hour)" });
  }

  const laInfo = getLosAngelesDateInfo();
  const todayLA = formatDateLA(new Date());
  const tz = "America/Los_Angeles";
  const birthdate = normalizeBirthdate(req.query.birthdate);

  if (!birthdate) {
    return res.status(400).json({ error: "请先配置生日" });
  }

  if (birthdate < "1900-01-01" || birthdate > laInfo.dateKey) {
    return res.status(400).json({
      error: "birthdate must be between 1900-01-01 and today (America/Los_Angeles)",
    });
  }

  const cacheKey = getFortuneCacheKey(birthdate, laInfo.dateKey);
  const nocache = isCacheBypass(req);
  const cached = getCachedData(cacheKey, laInfo.ttlMs, nocache);

  const isCachedUsable =
    !!cached &&
    cached.data &&
    cached.data.dayCompact &&
    Array.isArray(cached.data.dayCompact.bullets) &&
    cached.data.dayCompact.bullets.length === 4;

  if (isCachedUsable) {
    return res.status(200).json({
      ...cached!.data,
      cache_status: "cache",
      cache_age_seconds: cached!.cacheAgeSeconds,
      cache_expires_in_seconds: cached!.cacheExpiresInSeconds,
    });
  }

  try {
    const { parsed: modelPayload, meta } = await generateFortune(birthdate, laInfo.todayLabel);

    const finalPayload = {
      ...modelPayload,
      birthdate,
      today: todayLA,
      timezone: tz,
      generated_at: new Date().toISOString(),
      disclaimer: modelPayload.disclaimer || "本功能仅供娱乐参考，不构成医疗或投资建议。",
    };

    const enriched = fortuneResponseSchema.parse(finalPayload);
    const responseBody: any = enriched;
    if (process.env.NODE_ENV !== "production") {
      responseBody.meta = meta;
    }

    setCache(cacheKey, enriched);

    return res.status(200).json({
      ...responseBody,
      cache_status: "fresh",
    });
  } catch (error) {
    const stale = getStaleCache(cacheKey);
    if (stale?.data) {
      return res.status(200).json({
        ...stale.data,
        cache_status: "stale",
        warning: "使用离线缓存的今日运势，数据可能稍微滞后。",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[fortune] Failed to generate fortune:", message);
    return res.status(500).json({
      error: "Failed to generate fortune",
      message,
    });
  }
}
