import { generateFortune } from "./gemini.js";
import { formatDateLA, normalizeYMD } from "./date.js";
import { getLosAngelesDateInfo } from "./cache.js";
import { fortuneResponseSchema } from "./schema.js";

type CacheEntry = { value: any; expiresAt: number };

const memoryCache = new Map<string, CacheEntry>();
const PROMPT_VERSION = "v7";

function getCacheKey(params: { birthdate: string; today: string; model?: string }) {
  const model = params.model || process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  return `fortune:${PROMPT_VERSION}:model=${model}:today=${params.today}:birth=${params.birthdate}`;
}

function getFromCache(key: string) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key: string, value: any, ttlMs: number) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearFortuneCache() {
  memoryCache.clear();
}

export async function getFortuneService(birthdateRaw: string) {
  const birthdate = normalizeYMD(birthdateRaw || "");
  if (!birthdate) throw new Error("Invalid birthdate");

  const laInfo = getLosAngelesDateInfo();
  const todayLA = formatDateLA(new Date());
  const cacheKey = getCacheKey({ birthdate, today: laInfo.dateKey });

  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[fortune] birthdate=${birthdate} todayLA=${laInfo.dateKey} cacheKey=${cacheKey} hit=true`);
    return { ...cached, cache_status: "cache", meta: { ...(cached.meta || {}), cacheHit: true, cacheKey } };
  }

  console.log(`[fortune] birthdate=${birthdate} todayLA=${laInfo.dateKey} cacheKey=${cacheKey} hit=false`);
  const started = Date.now();
  console.log(`[fortune] gemini_call start cacheKey=${cacheKey}`);
  const { parsed: modelPayload, meta } = await generateFortune(birthdate, laInfo.todayLabel);
  const duration = Date.now() - started;
  console.log(`[fortune] gemini_call done cacheKey=${cacheKey} ms=${duration}`);

  const finalPayload = {
    ...modelPayload,
    birthdate,
    today: todayLA,
    timezone: "America/Los_Angeles",
    generated_at: new Date().toISOString(),
    disclaimer: modelPayload.disclaimer || "本功能仅供娱乐参考，不构成医疗或投资建议。",
  };

  const enriched = fortuneResponseSchema.parse(finalPayload);
  setCache(cacheKey, enriched, laInfo.ttlMs);

  return {
    ...enriched,
    cache_status: "fresh",
    meta: { ...meta, cacheHit: false, cacheKey },
  };
}
