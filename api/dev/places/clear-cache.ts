import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cache } from "../../api/utils.ts";
import { clearDedupMap } from "../../lib/spend/placesClient.ts";

export const runtime = "nodejs";

const CACHE_PREFIX = "places_pool:";

function isAllowed(req: VercelRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const token = req.headers["x-dev-admin-token"] as string | undefined;
  return !!token && token === process.env.DEV_ADMIN_TOKEN;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAllowed(req)) {
    return res.status(403).json({ error: "Dev cache clearing is disabled" });
  }

  const cleared: string[] = [];
  for (const key of cache.keys()) {
    if (key.startsWith(CACHE_PREFIX)) {
      cache.delete(key);
      cleared.push(key);
    }
  }
  clearDedupMap();

  return res.status(200).json({
    ok: true,
    cleared,
    cacheEntries: cache.size,
  });
}
