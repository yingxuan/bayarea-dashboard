export type RegionKey = "southbay" | "peninsula" | "eastbay" | "default";

export interface RegionProfile {
  key: RegionKey;
  displayName: string;
  cities: string[];
  whitelist: {
    milkTea: string[];
    chinese: string[];
    lateNight: string[];
    newOpenings: string[];
  };
  weights: {
    whitelistStrong: number;
    whitelistWeak: number;
    chineseCharsBonus: number;
    authenticSignalBonus: number;
    oldShopBonus: number;
    lateNightHoursBonus: number;
    fusionPenalty: number;
    dessertPenalty: number;
  };
}

const baseWeights = {
  whitelistStrong: 100,
  whitelistWeak: 40,
  chineseCharsBonus: 20,
  authenticSignalBonus: 15,
  oldShopBonus: 10,
  lateNightHoursBonus: 15,
  fusionPenalty: -30,
  dessertPenalty: -20,
};

export const regionProfiles: RegionProfile[] = [
  {
    key: "southbay",
    displayName: "South Bay",
    cities: ["cupertino", "sunnyvale", "santa clara", "mountain view", "milpitas", "san jose"],
    whitelist: {
      milkTea: [
        "yi fang",
        "yifang",
        "heytea",
        "nayuki",
        "naixue",
        "chagee",
        "the alley",
        "tiger sugar",
        "coco",
        "coco fresh",
        "gong cha",
        "贡茶",
        "tp tea",
        "天仁茗茶",
        "happy lemon",
        "sunright tea studio",
        "teaspoon",
      ],
      chinese: [
        "haidilao",
        "da long yi",
        "shancheng lameizi",
        "little sheep",
        "sichuan impression",
        "spicy house",
        "chongqing xiao mian",
        "cooking papa",
        "tai pan",
        "hong kong bistro",
        "saigon seafood harbor",
        "qq noodle",
        "ox 9 lanzhou handpulled noodles",
        "lanzhou beef noodle",
        "north china restaurant",
        "din tai fung",
        "dough zone",
        "chef chu's",
      ],
      lateNight: [
        "chongqing xiao mian",
        "spicy city",
        "da long yi",
        "lanzhou beef noodle",
        "ox 9 lanzhou handpulled noodles",
        "chuan skewers",
        "chuan wei zhen",
      ],
      newOpenings: ["chagee", "nayuki", "heytea", "palette tea house", "ox 9"],
    },
    weights: baseWeights,
  },
  {
    key: "peninsula",
    displayName: "Peninsula",
    cities: ["palo alto", "menlo park", "redwood city", "san mateo", "foster city", "burlingame", "millbrae", "san carlos"],
    whitelist: {
      milkTea: ["gong cha", "heytea", "coCo", "chagee"],
      chinese: ["din tai fung", "chef chu's", "xiang", "bbq king"],
      lateNight: ["chuan skewers", "spicy house"],
      newOpenings: ["palette tea house", "teaspoon"],
    },
    weights: {
      ...baseWeights,
      whitelistStrong: 90,
      lateNightHoursBonus: 10,
    },
  },
  {
    key: "eastbay",
    displayName: "East Bay",
    cities: ["fremont", "newark", "union city", "hayward", "dublin", "pleasanton", "san ramon", "oakland", "berkeley", "emeryville"],
    whitelist: {
      milkTea: ["gong cha", "coco", "happy lemon"],
      chinese: ["chef chu's", "din tai fung", "little sheep"],
      lateNight: ["spicy city", "lanzhou beef noodle"],
      newOpenings: ["palette tea house"],
    },
    weights: {
      ...baseWeights,
      whitelistStrong: 85,
      fusionPenalty: -25,
    },
  },
  {
    key: "default",
    displayName: "Bay Area",
    cities: [],
    whitelist: {
      milkTea: ["yi fang", "heytea", "tiger sugar", "gong cha", "coco"],
      chinese: ["chef chu's", "din tai fung"],
      lateNight: ["spicy house"],
      newOpenings: ["palette tea house"],
    },
    weights: {
      ...baseWeights,
      whitelistStrong: 80,
      authenticSignalBonus: 10,
    },
  },
];

export function getRegionProfile(city?: string, vicinity?: string, forced?: RegionKey): RegionProfile {
  if (forced) {
    return regionProfiles.find((profile) => profile.key === forced) || regionProfiles[3];
  }
  const normalized = `${city || ""} ${vicinity || ""}`.toLowerCase();
  for (const key of ["southbay", "peninsula", "eastbay"] as RegionKey[]) {
    const profile = regionProfiles.find((p) => p.key === key);
    if (!profile) continue;
    if (profile.cities.some((cityName) => normalized.includes(cityName))) {
      return profile;
    }
  }
  return regionProfiles[3];
}
