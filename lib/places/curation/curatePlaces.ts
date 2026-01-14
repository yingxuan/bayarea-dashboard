import type { RegionKey, RegionProfile } from "./regionProfiles";
import { regionProfiles, getRegionProfile } from "./regionProfiles";

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
  chinese: ["川", "湘", "粤", "港", "台", "火锅", "面", "饺子", "烧烤", "家常"],
  lateNight: ["夜宵", "烧烤", "串", "麻辣", "面", "火锅", "煲"],
  newOpenings: [],
};

const CHINESE_SIGNAL_TYPES = ["asian_restaurant", "chinese", "hot pot"];

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
  const types = normalizeArray([... (place.types || []), ...(place.categories || [])]);
  if (types.some((type) => GLOBAL_HARD_TYPES.has(type))) return "type exclusion";
  const name = place.name.toLowerCase();
  if (GLOBAL_HARD_NAME.some((keyword) => name.includes(keyword))) return "name exclusion";
  return null;
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
    return (
      matchesWhitelist(place, profile.whitelist.newOpenings) !== null ||
      (place.userRatingCount || 0) < 100 ||
      POSITIVE_KEYWORDS.chinese.some((keyword) => normalized.includes(keyword))
    );
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

  const addIfPass = (place: PlaceCandidate, tier: number, reason?: string) => {
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

  const final = buildTieredList(tiered, 6);
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
