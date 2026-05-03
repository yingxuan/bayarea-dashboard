import type { RegionKey, RegionProfile } from "./regionProfiles";
import { getRegionProfile } from "./regionProfiles";

export type CategoryKey = "milkTea" | "chinese" | "lateNight" | "newOpenings";

export interface PlaceCandidate {
  id: string;
  name: string;
  rating: number;
  userRatingCount: number;
  city?: string;
  vicinity?: string;
  types?: string[];
  categories?: string[];
  openingHours?: { openNow?: boolean; periods?: { open: { hour: number } }[] };
}

export interface CuratedPlace extends PlaceCandidate {
  score: number;
  badges?: string[];
}

export interface CurateDebug {
  region: RegionKey;
  tiersUsed: number;
  excludedSamples: Array<{ name: string; reason: string; types?: string[] }>;
  includedBreakdown: Record<
    string,
    {
      score: number;
      popularity: number;
      priors: string[];
      penalties: string[];
      positiveSignals: string[];
      hardExclusionsTriggered?: string[];
      tier: 1 | 2 | 3;
    }
  >;
}

type InclusionTier = 1 | 2 | 3;

const GLOBAL_HARD_TYPES = new Set([
  "bowling_alley",
  "bar",
  "night_club",
  "casino",
  "sports_complex",
  "stadium",
  "amusement_center",
  "movie_theater",
  "shopping_mall",
  "department_store",
  "coffee_shop",
]);
const GLOBAL_HARD_NAME = ["bowl", "bowling", "bar", "pub", "lounge", "casino", "steak", "grill", "brew", "roast", "coffee"];

const BASE_POPULARITY = (place: PlaceCandidate) => Math.log((place.userRatingCount || 0) + 1) * 10 + ((place.rating || 0) - 4) * 5;

const POSITIVE_KEYWORDS = {
  milkTea: ["milk tea", "boba", "bubble tea", "奶茶", "珍珠", "黑糖", "芝士"],
  chinese: ["川", "湘", "粤", "港", "台", "火锅", "面", "饺子", "烧烤", "家常", "noodle", "dumpling", "sichuan", "hot pot"],
  lateNight: ["夜宵", "烧烤", "烤串", "串", "麻辣", "小龙虾", "卤味", "粥", "面", "米线", "砂锅", "火锅", "串串", "烤鱼", "skewer", "bbq skewers", "hot pot", "noodles", "congee", "spicy", "sichuan"],
  newOpenings: [],
};

const CHINESE_SIGNAL_TYPES = ["asian_restaurant", "chinese", "hot pot"];
const NEW_OPENING_EXCLUDE_BRANDS: string[] = [];

function normalizeArray(input?: string[]): string[] {
  return (input || []).map((entry) => entry.toLowerCase());
}

function matchesWhitelist(place: PlaceCandidate, whitelist: string[]): string | null {
  const normalized = `${place.name} ${(place.categories || []).join(" ")} ${(place.types || []).join(" ")}`.toLowerCase();
  for (const term of whitelist) {
    if (normalized.includes(term.toLowerCase())) return term;
  }
  return null;
}

function positiveSignal(place: PlaceCandidate, category: CategoryKey, profile: RegionProfile): string[] {
  const signals: string[] = [];
  const normalized = place.name.toLowerCase();
  if (POSITIVE_KEYWORDS[category].some((keyword) => normalized.includes(keyword))) signals.push("keyword match");
  if (profile.whitelist[category].some((term) => normalized.includes(term.toLowerCase()))) signals.push("whitelist match");
  if ((place.types || []).some((type) => CHINESE_SIGNAL_TYPES.includes(type.toLowerCase()))) signals.push("authentic type");
  return signals;
}

function hasHardExclusion(place: PlaceCandidate): string | null {
  const types = normalizeArray([...(place.types || []), ...(place.categories || [])]);
  if (types.some((type) => GLOBAL_HARD_TYPES.has(type))) return "type exclusion";
  const name = place.name.toLowerCase();
  if (GLOBAL_HARD_NAME.some((keyword) => name.includes(keyword))) return "name exclusion";
  return null;
}

function hasChineseFriendly(place: PlaceCandidate, profile: RegionProfile): { ok: boolean; signals: string[] } {
  const signals: string[] = [];
  const normalized = `${place.name} ${(place.categories || []).join(" ")} ${(place.types || []).join(" ")}`.toLowerCase();
  if (/[^\x00-\x7F]/.test(place.name)) signals.push("chinese_chars");
  if (POSITIVE_KEYWORDS.chinese.some((k) => normalized.includes(k))) signals.push("chinese_keyword");
  if ((place.types || []).some((t) => CHINESE_SIGNAL_TYPES.includes(t.toLowerCase()))) signals.push("chinese_type");
  if (profile.whitelist.chinese.some((term) => normalized.includes(term))) signals.push("whitelist_chinese");
  if (profile.whitelist.milkTea.some((term) => normalized.includes(term))) signals.push("whitelist_milktea");
  return { ok: signals.length > 0, signals };
}

function hasLateNightSignal(place: PlaceCandidate, profile: RegionProfile): { ok: boolean; signals: string[] } {
  const signals: string[] = [];
  const normalized = `${place.name} ${(place.categories || []).join(" ")} ${(place.types || []).join(" ")}`.toLowerCase();
  if (POSITIVE_KEYWORDS.lateNight.some((k) => normalized.includes(k))) signals.push("night_keyword");
  if (profile.whitelist.lateNight.some((term) => normalized.includes(term))) signals.push("night_whitelist");
  return { ok: signals.length > 0, signals };
}

function isOpenAfter22(place: PlaceCandidate): boolean {
  const periods = place.openingHours?.periods || [];
  return periods.some((p) => p.open?.hour !== undefined && p.open.hour >= 22);
}

function isNewOpeningExcluded(place: PlaceCandidate): boolean {
  const nameLower = place.name.toLowerCase();
  return NEW_OPENING_EXCLUDE_BRANDS.some((term) => nameLower.includes(term.toLowerCase()));
}

function qualifiesForCategory(place: PlaceCandidate, category: CategoryKey, profile: RegionProfile): boolean {
  const normalized = `${place.name} ${(place.categories || []).join(" ")} ${(place.types || []).join(" ")}`.toLowerCase();
  const typeMatch = (place.types || []).some((type) => CHINESE_SIGNAL_TYPES.includes(type.toLowerCase()));
  if (category === "milkTea") {
    return (
      matchesWhitelist(place, profile.whitelist.milkTea) !== null ||
      POSITIVE_KEYWORDS.milkTea.some((keyword) => normalized.includes(keyword)) ||
      typeMatch
    );
  }
  if (category === "chinese") {
    return (
      matchesWhitelist(place, profile.whitelist.chinese) !== null ||
      POSITIVE_KEYWORDS.chinese.some((keyword) => normalized.includes(keyword)) ||
      CHINESE_SIGNAL_TYPES.some((type) => normalized.includes(type))
    );
  }
  if (category === "lateNight") {
    const baseChinese = qualifiesForCategory(place, "chinese", profile);
    const lateNight = POSITIVE_KEYWORDS.lateNight.some((keyword) => normalized.includes(keyword));
    return baseChinese && (lateNight || matchesWhitelist(place, profile.whitelist.lateNight) !== null);
  }
  if (category === "newOpenings") {
    // handled in custom flow
    return true;
  }
  return false;
}

function scorePlace(place: PlaceCandidate, profile: RegionProfile, category: CategoryKey): { score: number; priors: string[]; penalties: string[]; positive: string[] } {
  const base = BASE_POPULARITY(place);
  let score = base;
  const priors: string[] = [];
  const penalties: string[] = [];
  const positiveSignals = positiveSignal(place, category, profile);

  const whitelistStrong = matchesWhitelist(place, profile.whitelist[category]) !== null;
  if (whitelistStrong) {
    score += profile.weights.whitelistStrong;
    priors.push("whitelist strong");
  } else if (positiveSignals.length > 0) {
    score += profile.weights.whitelistWeak;
    priors.push("positive signal");
  }
  if (CHINESE_SIGNAL_TYPES.some((type) => normalizeArray(place.types).includes(type))) {
    score += profile.weights.authenticSignalBonus;
    priors.push("authentic type");
  }
  if (/[^\x00-\x7F]/.test(place.name)) {
    score += profile.weights.chineseCharsBonus;
    priors.push("Chinese chars");
  }
  if ((place.userRatingCount || 0) > 500) {
    score += profile.weights.oldShopBonus;
    priors.push("老牌");
  }
  if (category === "lateNight" && place.openingHours?.periods?.some((period) => period.open.hour >= 22)) {
    score += profile.weights.lateNightHoursBonus;
    priors.push("late night hours");
  }
  const name = place.name.toLowerCase();
  if (name.includes("fusion")) {
    score += profile.weights.fusionPenalty;
    penalties.push("fusion penalty");
  }
  if (category === "chinese" || category === "lateNight") {
    if (name.includes("dessert")) {
      score += profile.weights.dessertPenalty;
      penalties.push("dessert penalty");
    }
  }
  return { score, priors, penalties, positive: positiveSignals };
}

function buildTieredList(tiers: CuratedPlace[][], needed: number): CuratedPlace[] {
  const result: CuratedPlace[] = [];
  for (let i = 0; i < tiers.length && result.length < needed; i++) {
    const remaining = needed - result.length;
    result.push(...tiers[i].slice(0, remaining));
  }
  return result;
}

export interface CurateOptions {
  category: CategoryKey;
  regionKey?: RegionKey;
  city?: string;
  vicinity?: string;
  relaxed?: boolean;
  debug?: boolean;
}

export interface CurateResult {
  items: CuratedPlace[];
  debug?: CurateDebug;
}

export function curatePlaces(
  pool: PlaceCandidate[],
  options: CurateOptions
): CurateResult {
  const regionProfile = getRegionProfile(options.city, options.vicinity, options.regionKey);
  const tiered: CuratedPlace[][] = [[], [], []];
  const excludedSamples: CurateDebug["excludedSamples"] = [];
  const includedBreakdown: CurateDebug["includedBreakdown"] = {};

  const addIfPass = (place: PlaceCandidate, tier: InclusionTier, reason?: string) => {
    const dir = scorePlace(place, regionProfile, options.category);
    const curated: CuratedPlace = {
      ...place,
      score: dir.score,
      badges: dir.priors.length > 0 ? dir.priors : undefined,
    };
    tiered[tier - 1].push(curated);
    includedBreakdown[place.id] = {
      score: dir.score,
      popularity: BASE_POPULARITY(place),
      priors: dir.priors,
      penalties: dir.penalties,
      positiveSignals: dir.positive,
      tier,
    };
    if (options.debug && reason) {
      includedBreakdown[place.id].hardExclusionsTriggered = [reason];
    }
  };

  const whitelist = regionProfile.whitelist[options.category];

  // Custom flows for lateNight and newOpenings
  if (options.category === "lateNight") {
    for (const place of pool) {
      const hard = hasHardExclusion(place);
      if (hard) {
        if (excludedSamples.length < 10) {
          excludedSamples.push({ name: place.name, reason: hard, types: [...(place.types || []), ...(place.categories || [])] });
        }
        continue;
      }
      const chineseCheck = hasChineseFriendly(place, regionProfile);
      const nightCheck = hasLateNightSignal(place, regionProfile);
      if (!chineseCheck.ok) {
        if (excludedSamples.length < 10) excludedSamples.push({ name: place.name, reason: "missing_chinese_signal" });
        continue;
      }
      const basePop = BASE_POPULARITY(place);
      let score = basePop;
      const priors: string[] = [];
      const penalties: string[] = [];

      if (nightCheck.ok) {
        score += 30;
        priors.push("night_keyword");
      }
      if (isOpenAfter22(place)) {
        score += 15;
        priors.push("open_after_22");
      }
      const rc = place.userRatingCount || 0;
      const rt = place.rating || 0;
      if (rc > 500) {
        score += 10;
        priors.push("old_nightshop");
      }
      if (place.name.toLowerCase().includes("fusion")) {
        score -= 30;
        penalties.push("fusion_penalty");
      }
      if (place.name.toLowerCase().includes("dessert")) {
        score -= 20;
        penalties.push("dessert_penalty");
      }

      const curated: CuratedPlace = { ...place, score };

      // tier assignment
      if (chineseCheck.ok && (nightCheck.ok)) {
        tiered[0].push(curated);
        includedBreakdown[place.id] = { score, popularity: basePop, priors, penalties, positiveSignals: [...chineseCheck.signals, ...nightCheck.signals], tier: 1 };
        continue;
      }
      if (chineseCheck.ok && rc >= 250 && rt >= 4.1) {
        tiered[1].push(curated);
        includedBreakdown[place.id] = { score, popularity: basePop, priors, penalties, positiveSignals: chineseCheck.signals, tier: 2 };
        continue;
      }
      if (chineseCheck.ok && (rc >= 400 || matchesWhitelist(place, regionProfile.whitelist.lateNight))) {
        tiered[2].push(curated);
        includedBreakdown[place.id] = { score, popularity: basePop, priors, penalties, positiveSignals: chineseCheck.signals, tier: 3 };
        continue;
      }
      if (excludedSamples.length < 10) excludedSamples.push({ name: place.name, reason: "missing_night_signal" });
    }
  } else if (options.category === "newOpenings") {
    for (const place of pool) {
      const hard = hasHardExclusion(place);
      if (hard) {
        if (excludedSamples.length < 10) excludedSamples.push({ name: place.name, reason: hard });
        continue;
      }
      const chineseCheck = hasChineseFriendly(place, regionProfile);
      const normalized = place.name.toLowerCase();
      const dessertKeywords = ["甜品", "糖水", "芋圆", "豆花", "仙草", "dessert", "sweet tofu"];
      if (dessertKeywords.some((k) => normalized.includes(k))) chineseCheck.signals.push("dessert_cn");
      if (!chineseCheck.ok) {
        if (excludedSamples.length < 10) excludedSamples.push({ name: place.name, reason: "not_chinese_friendly" });
        continue;
      }

      // recency + Chinese-friendly scoring
      let score = BASE_POPULARITY(place);
      const priors: string[] = [];
      const penalties: string[] = [];
      const rc = place.userRatingCount || 0;
      const rt = place.rating || 0;

      if (matchesWhitelist(place, regionProfile.whitelist.milkTea)) {
        score += 100;
        priors.push("milk_tea_whitelist");
      }
      if (matchesWhitelist(place, regionProfile.whitelist.newOpenings)) {
        score += 60;
        priors.push("new_opening_whitelist");
      }
      if (rc < 120 && rt >= 4.5) {
        score += 25;
        priors.push("recency_120_4.5");
      } else if (rc < 200 && rt >= 4.4) {
        score += 15;
        priors.push("recency_200_4.4");
      } else if (rc < 400 && rt >= 4.3) {
        score += 10;
        priors.push("recency_400_4.3");
      }
      if (/[^\x00-\x7F]/.test(place.name)) {
        score += 20;
        priors.push("chinese_chars");
      }
      if (POSITIVE_KEYWORDS.chinese.some((k) => normalized.includes(k))) {
        score += 15;
        priors.push("authentic_keyword");
      }
      if (rc > 1500) {
        score -= 25;
        penalties.push("penalty_old");
      }
      if (normalized.includes("fusion") && !matchesWhitelist(place, regionProfile.whitelist.chinese)) {
        score -= 20;
        penalties.push("penalty_fusion");
      }

      const breakdownPos = [...chineseCheck.signals];

      // tiers
      if (chineseCheck.ok && (rc < 250 || matchesWhitelist(place, regionProfile.whitelist.newOpenings) || matchesWhitelist(place, regionProfile.whitelist.milkTea))) {
        const curated: CuratedPlace = { ...place, score };
        tiered[0].push(curated);
        includedBreakdown[place.id] = { score, popularity: BASE_POPULARITY(place), priors, penalties, positiveSignals: breakdownPos, tier: 1 };
        continue;
      }
      if (chineseCheck.ok && rc < 400 && rt >= 4.2) {
        const curated: CuratedPlace = { ...place, score };
        tiered[1].push(curated);
        includedBreakdown[place.id] = { score, popularity: BASE_POPULARITY(place), priors, penalties, positiveSignals: breakdownPos, tier: 2 };
        continue;
      }
      if (chineseCheck.ok && rt >= 4.1) {
        const curated: CuratedPlace = { ...place, score };
        tiered[2].push(curated);
        includedBreakdown[place.id] = { score, popularity: BASE_POPULARITY(place), priors, penalties, positiveSignals: breakdownPos, tier: 3 };
        continue;
      }
      if (excludedSamples.length < 10) excludedSamples.push({ name: place.name, reason: "missing_new_opening_signal" });
    }
  } else {
    for (const place of pool) {
      const hard = hasHardExclusion(place);
      if (hard) {
        if (excludedSamples.length < 10) {
          excludedSamples.push({ name: place.name, reason: hard, types: [...(place.types || []), ...(place.categories || [])] });
        }
        continue;
      }
      const qualifies = qualifiesForCategory(place, options.category, regionProfile);
      if (!qualifies) {
        if (excludedSamples.length < 10) {
          excludedSamples.push({ name: place.name, reason: "missing positive signal" });
        }
        continue;
      }
      const whitelistStrong = matchesWhitelist(place, whitelist);
      if (whitelistStrong) {
        addIfPass(place, 1, whitelistStrong);
        continue;
      }
      const positiveSignals = positiveSignal(place, options.category, regionProfile);
      if (positiveSignals.length > 0) {
        addIfPass(place, 2);
        continue;
      }
      addIfPass(place, 3);
    }
  }

  const targetCount = Math.max(10, pool.length);
  const final = buildTieredList(tiered, targetCount);
  const debug: CurateDebug = {
    region: regionProfile.key,
    tiersUsed: tiered.findIndex((tier) => tier.length > 0) + 1 || 0,
    excludedSamples,
    includedBreakdown,
  };

  return {
    items: final,
    debug: options.debug ? debug : undefined,
  };
}
