import type { VercelRequest, VercelResponse } from "@vercel/node";

import { setCorsHeaders, handleOptions } from "../lib/api-utils.js";
import { normalizeYMD } from "../lib/fortune/date.js";
import { getFortuneService, LockContentionError } from "../lib/fortune/service.js";

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

  try {
    const birthdate = normalizeBirthdate(req.query.birthdate);
    if (!birthdate) {
      return res.status(400).json({ error: "请先配置生日" });
    }
    if (birthdate < "1900-01-01") {
      return res.status(400).json({ error: "birthdate must be between 1900-01-01 and today (America/Los_Angeles)" });
    }

    const result = await getFortuneService(birthdate);
    const cacheHeader = result.cache_status === "cache" ? "kv-hit" : "kv-miss";
    const lockHeader = result.meta?.lockStatus || "none";
    res.setHeader("X-Fortune-Cache", cacheHeader);
    res.setHeader("X-Fortune-Lock", lockHeader);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof LockContentionError) {
      res.setHeader("X-Fortune-Cache", "kv-miss");
      res.setHeader("X-Fortune-Lock", "contended");
      res.setHeader("Retry-After", error.retryAfter.toString());
      return res.status(503).json({
        error: "Fortune generation in progress",
        message: error.message,
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
