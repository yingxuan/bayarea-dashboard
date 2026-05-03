import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cache, isCacheBypass, setCache, setCorsHeaders } from "../api-utils.js";
import { searchGoogle } from "../../server/googleCSE.js";

const DISH_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DISH_CACHE_TTL_SECONDS = Math.floor(DISH_CACHE_TTL_MS / 1000);
const EMPTY_CACHE_TTL_SECONDS = 2 * 24 * 60 * 60;

interface RecommendedDishesResponse {
  dishes: string[];
  source: "google_cse";
  sourceUrl?: string;
  confidence: "high" | "medium" | "low";
  fetchedAt: string;
}

type CandidateScore = {
  score: number;
  count: number;
  sourceUrl?: string;
};

const TRUSTED_DISH_DOMAINS = [
  "yelp.com",
  "theinfatuation.com",
  "eater.com",
  "tripadvisor.com",
  "restaurantji.com",
  "ubereats.com",
  "doordash.com",
  "grubhub.com",
];

const FOOD_WORDS = [
  "noodle",
  "ramen",
  "udon",
  "pho",
  "rice",
  "fried",
  "chicken",
  "beef",
  "pork",
  "lamb",
  "fish",
  "shrimp",
  "crab",
  "tofu",
  "dumpling",
  "wonton",
  "bao",
  "bun",
  "soup",
  "salad",
  "sandwich",
  "burger",
  "pizza",
  "pasta",
  "steak",
  "taco",
  "burrito",
  "roll",
  "sushi",
  "curry",
  "skewer",
  "wing",
  "fries",
  "cake",
  "pastry",
  "latte",
  "coffee",
  "tea",
  "boba",
  "hot pot",
  "hotpot",
  "bbq",
];

const SENTENCE_WORDS = /\b(i|we|you|they|he|she|people|everyone|everything|something|nothing|here|there|place|restaurant|staff|service|ambience|vibe|portion|price|prices|menu)\b/i;
const VERB_WORDS = /\b(is|are|was|were|be|been|being|have|has|had|do|did|does|came|come|go|went|make|made|worth|super|really|very|pretty|quite|just|love|loved|like|liked)\b/i;
const CHINESE_FOOD_CHARS = /[面饭粉汤粥包饺饼锅串鸡牛羊猪肉鱼虾蟹茶糕卷]|奶茶|火锅|烧烤|炒饭|小笼包|煎饼|拉面|寿司|刺身/;

const NON_WORD_CHARS = /[^a-z0-9\u4e00-\u9fff\s]/gi;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(NON_WORD_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDishLabel(value: string) {
  return value
    .replace(/\b(?:the|a|an|our|their|this|that)\b/gi, " ")
    .replace(/^[^A-Za-z\u4e00-\u9fff]+/, "")
    .replace(/[^A-Za-z\u4e00-\u9fff0-9&'/+\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCacheKey(placeId: string | null, name: string, city: string) {
  const fallback = `${normalizeText(name)}|${normalizeText(city) || "na"}`;
  return `spend:recommended-dishes:${placeId && !placeId.startsWith("seed_") ? placeId : fallback}`;
}

function buildQueries(name: string, city: string) {
  const quotedName = `"${name}"`;
  const cityPart = city ? ` "${city}"` : "";
  return [
    `${quotedName}${cityPart} best dishes must order`,
    `${quotedName}${cityPart} signature dish menu`,
  ];
}

function getCacheTtlMs(data: RecommendedDishesResponse) {
  return (data.dishes.length > 0 ? DISH_CACHE_TTL_SECONDS : EMPTY_CACHE_TTL_SECONDS) * 1000;
}

function getCachedRecommendedDishes(cacheKey: string, nocache: boolean) {
  if (nocache) return null;
  const cached = cache.get(cacheKey);
  const data = cached?.data as RecommendedDishesResponse | undefined;
  if (!cached || !data) return null;
  if (Date.now() - cached.timestamp >= getCacheTtlMs(data)) {
    return null;
  }
  return data;
}

function isLikelyDishName(candidate: string, restaurantName: string) {
  const lowered = candidate.toLowerCase();
  const normalizedRestaurant = normalizeText(restaurantName);

  if (candidate.length < 3 || candidate.length > 24) return false;
  if (SENTENCE_WORDS.test(candidate)) return false;
  if (VERB_WORDS.test(candidate)) return false;
  if (normalizedRestaurant.includes(normalizeText(candidate))) return false;

  const hasFoodWord = FOOD_WORDS.some((word) => lowered.includes(word));
  const hasChineseFoodSignal = CHINESE_FOOD_CHARS.test(candidate);
  const words = candidate.split(/\s+/).filter(Boolean);
  const titleLike = words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Z][A-Za-z0-9&'+-]*$/.test(word));

  return hasFoodWord || hasChineseFoodSignal || titleLike;
}

function extractDishCandidates(text: string) {
  const patterns = [
    /(?:must(?:\s+try|\s+order)?|best dishes?(?: include)?|popular dishes?(?: include)?|signature dishes?(?: include)?|known for|go for|order(?:ed)?|try(?: the)?|get(?: the)?|favorite(?: dish)?(?: is)?|recommended?)[:\s]+([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff&'/+\-\s]{2,32})(?=[,.;!]|$|\s+(?:at|with|because|but|which|that)\b)/gi,
    /(?:点|推荐|必点|招牌|最好吃的是|一定要试试)\s*[:：]?\s*([\u4e00-\u9fffA-Za-z][A-Za-z0-9\u4e00-\u9fff&'/+\-\s]{1,18})(?=[，。；、!]|$|\s+(?:配|加|但是|不过))/g,
  ];

  const results: string[] = [];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = normalizeDishLabel(match[1] || "");
      if (!raw) continue;

      const candidates = raw
        .split(/,|\/| and | or |、|，/i)
        .map((item) => normalizeDishLabel(item))
        .filter(Boolean)
        .slice(0, 3);

      results.push(...candidates);
    }
  }

  return results;
}

async function fetchRecommendedDishes(name: string, city: string) {
  const candidates = new Map<string, CandidateScore>();

  for (const query of buildQueries(name, city)) {
    const results = await searchGoogle(query, 6);

    for (const result of results) {
      const haystack = `${result.title} ${result.snippet}`;
      const normalizedHaystack = normalizeText(haystack);
      const normalizedName = normalizeText(name);

      if (!normalizedHaystack.includes(normalizedName.split(" ").slice(0, 2).join(" "))) {
        continue;
      }

      const trustedDomain = TRUSTED_DISH_DOMAINS.some((domain) => result.displayLink.includes(domain));
      const extracted = extractDishCandidates(haystack);

      for (const candidate of extracted) {
        if (!isLikelyDishName(candidate, name)) continue;

        const existing = candidates.get(candidate);
        const inTitle = normalizeText(result.title).includes(normalizeText(candidate));
        const scoreBoost = (trustedDomain ? 3 : 0) + (inTitle ? 2 : 0) + 1;

        candidates.set(candidate, {
          score: (existing?.score || 0) + scoreBoost,
          count: (existing?.count || 0) + 1,
          sourceUrl: existing?.sourceUrl || result.link,
        });
      }
    }
  }

  const ranked = Array.from(candidates.entries())
    .filter(([, meta]) => meta.count >= 2 || meta.score >= 5)
    .sort((a, b) => b[1].score - a[1].score || b[1].count - a[1].count || a[0].length - b[0].length)
    .slice(0, 3);

  if (ranked.length === 0) {
    return {
      dishes: [],
      source: "google_cse" as const,
      confidence: "low" as const,
      sourceUrl: undefined,
      fetchedAt: new Date().toISOString(),
    };
  }

  const topScore = ranked[0][1].score;

  return {
    dishes: ranked.map(([dish]) => dish),
    source: "google_cse" as const,
    confidence: topScore >= 7 ? "high" as const : "medium" as const,
    sourceUrl: ranked[0][1].sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function handleRecommendedDishes(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const name = String(req.query.name || "").trim();
  const city = String(req.query.city || "").trim();
  const placeId = String(req.query.placeId || "").trim() || null;

  if (!name) {
    return res.status(400).json({ error: "Missing name parameter" });
  }

  const cacheKey = buildCacheKey(placeId, name, city);
  const nocache = isCacheBypass(req);
  const cached = getCachedRecommendedDishes(cacheKey, nocache);
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const result = await fetchRecommendedDishes(name, city);
    setCache(
      cacheKey,
      result,
    );
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("[recommended-dishes] failed", error);

    const fallback: RecommendedDishesResponse = {
      dishes: [],
      source: "google_cse",
      confidence: "low",
      fetchedAt: new Date().toISOString(),
    };
    setCache(cacheKey, fallback);
    return res.status(200).json(fallback);
  }
}

export const recommendedDishesTtls = {
  fresh: DISH_CACHE_TTL_SECONDS,
  empty: EMPTY_CACHE_TTL_SECONDS,
};
