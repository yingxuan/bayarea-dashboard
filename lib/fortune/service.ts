import { DateTime } from "luxon";
import { generateFortune, FortunePromptArgs } from "./gemini.js";
import { normalizeYMD } from "./date.js";
import { getLosAngelesDateInfo } from "./cache.js";
import { normalizeFortunePayload } from "./normalize.js";
import { fortuneResponseSchema } from "./schema.js";
import { acquireLock, deleteJSON, getJSON, isRedisAvailable, releaseLock, setJSON } from "./kv.js";

const CACHE_TTL_SECONDS = 36 * 60 * 60; // 36 hours
const LOCK_TTL_SECONDS = 90;
const POLL_ATTEMPTS = 6;
const POLL_DELAY_MIN_MS = 250;
const POLL_DELAY_MAX_MS = 400;
const CACHE_PREFIX = "fortune:v1";

export class LockContentionError extends Error {
  public readonly retryAfter = 2;
  constructor(message = "Fortune generation in progress, please retry shortly") {
    super(message);
    this.name = "LockContentionError";
  }
}

function getCacheKey(birthdate: string, laDate: string) {
  return `${CACHE_PREFIX}:${birthdate}:${laDate}`;
}

function getLockKey(birthdate: string, laDate: string) {
  return `fortune_lock:v1:${birthdate}:${laDate}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMeta(base: any, cacheKey: string, lockStatus: "none" | "acquired" | "contended", cacheHit: boolean) {
  return {
    ...(base || {}),
    cacheHit,
    cacheKey,
    lockStatus,
    cacheSource: isRedisAvailable ? "kv" : "memory",
  };
}

async function parseCachedResponse(
  raw: any,
  cacheKey: string,
  lockStatus: "none" | "contended"
) {
  try {
    let cached: any;
    if (typeof raw === "string") {
      cached = JSON.parse(raw);
    } else if (raw && typeof raw === "object") {
      cached = raw;
      // normalize: rewrite as string for future stability
      await setJSON(cacheKey, JSON.stringify(raw), CACHE_TTL_SECONDS);
    } else {
      return null;
    }
    const normalizedCache = normalizeFortunePayload({
      headline: cached.headline,
      verdict: cached.verdict,
      do: cached.do,
      dont: cached.dont,
      timeHint: cached.timeHint,
      importance: cached.importance,
      behaviorRadar: cached.behaviorRadar,
    });
    cached = {
      ...cached,
      ...normalizedCache.payload,
    };
    await setJSON(cacheKey, JSON.stringify(cached), CACHE_TTL_SECONDS);
    return {
      ...cached,
      cache_status: "cache",
      meta: buildMeta(cached.meta, cacheKey, lockStatus, true),
    };
  } catch (error) {
    console.error(`[fortune] cache_parse_failed cacheKey=${cacheKey}`, error);
    await deleteJSON(cacheKey);
    return null;
  }
}

async function pollForCachedValue(cacheKey: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const cachedRaw = await getJSON(cacheKey);
    if (cachedRaw) {
      return cachedRaw;
    }
    const delay =
      POLL_DELAY_MIN_MS +
      Math.floor(Math.random() * (POLL_DELAY_MAX_MS - POLL_DELAY_MIN_MS + 1));
    await sleep(delay);
  }
  return null;
}

export async function getFortuneService(birthdateRaw: string) {
  const birthdate = normalizeYMD(birthdateRaw || "");
  if (!birthdate) throw new Error("Invalid birthdate");

  const laNow = DateTime.now().setZone("America/Los_Angeles");
  const laDate = laNow.toISODate();
  if (!laDate) throw new Error("Failed to get LA date");
  const laInfo = getLosAngelesDateInfo(laNow.toJSDate());
  const cacheKey = getCacheKey(birthdate, laDate);
  const lockKey = getLockKey(birthdate, laDate);
  const todayLA = laDate;
  console.log("[fortune] kv_key", { birthdate, laDate, key: cacheKey, lockKey });

  console.log(
    `[fortune] redis_enabled=${isRedisAvailable} birthdate=${birthdate} todayLA=${laInfo.dateKey}`
  );

  const cachedRaw = await getJSON(cacheKey);
  if (cachedRaw) {
    const cachedResponse = await parseCachedResponse(cachedRaw, cacheKey, "none");
    if (cachedResponse) {
      console.log(
        `[fortune] birthdate=${birthdate} todayLA=${laInfo.dateKey} cacheKey=${cacheKey} kv_hit=true`
      );
      return cachedResponse;
    }
  }

  console.log(
    `[fortune] birthdate=${birthdate} todayLA=${laInfo.dateKey} cacheKey=${cacheKey} kv_hit=false kv_miss=true`
  );
  const lockAcquired = await acquireLock(lockKey, LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    console.log(`[fortune] lock_contended cacheKey=${cacheKey}`);
    const polledRaw = await pollForCachedValue(cacheKey);
    if (polledRaw) {
      console.log(`[fortune] lock_contended -> kv_hit cacheKey=${cacheKey}`);
      return parseCachedResponse(polledRaw, cacheKey, "contended");
    }
    console.log(`[fortune] lock_contended_timeout cacheKey=${cacheKey}`);
    throw new LockContentionError();
  }

  console.log(`[fortune] lock_acquired cacheKey=${cacheKey}`);
  let responsePayload: any;
  try {
    const started = Date.now();
    console.log(`[fortune] gemini_call start cacheKey=${cacheKey}`);
    const todayDateStr = laInfo.dateKey;
    const yesterdayDate = DateTime.fromISO(todayDateStr).minus({ days: 1 }).toISODate() ?? todayDateStr;
    const next3Days = [1, 2, 3]
      .map((offset) => DateTime.fromISO(todayDateStr).plus({ days: offset }).toISODate() ?? "")
      .filter(Boolean)
      .join("、");
    const lunarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const lunarDate = lunarFormatter.format(laInfo.now);
    const promptArgs: FortunePromptArgs = {
      birthEightChar: birthdate,
      todayDate: todayDateStr,
      lunarDate,
      yesterdayDate,
      next3Days,
    };
    const { parsed: modelPayload, meta } = await generateFortune(
      birthdate,
      laInfo.todayLabel,
      promptArgs
    );
    const duration = Date.now() - started;
    console.log(`[fortune] gemini_call done cacheKey=${cacheKey} ms=${duration}`);

    const enriched = fortuneResponseSchema.parse({
      ...modelPayload,
      birthdate,
      today: todayLA,
      timezone: "America/Los_Angeles",
      generated_at: new Date().toISOString(),
      disclaimer: "本功能仅供娱乐参考，不构成医疗或投资建议。",
    });
    const payloadStr = JSON.stringify(enriched);
    await setJSON(cacheKey, payloadStr, CACHE_TTL_SECONDS);
    console.log(`[fortune] kv_set cacheKey=${cacheKey} ttl=${CACHE_TTL_SECONDS}`);

    responsePayload = {
      ...enriched,
      cache_status: "fresh",
      meta: buildMeta(meta, cacheKey, "acquired", false),
    };
    return responsePayload;
  } finally {
    await releaseLock(lockKey);
  }
}
