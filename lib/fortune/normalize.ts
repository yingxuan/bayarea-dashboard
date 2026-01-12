import type { FortuneModelPayload } from "./schema.js";
import { bulletToString } from "./coerce.js";

const DEFAULT_TEXT = "信息不足，先以保守取象。";

const CATEGORY_DEFAULTS: Record<string, { reason: string; actions: string[]; ten_god: string }> = {
  career: {
    ten_god: "偏印",
    reason: "聚焦技术与交付，稳步推进。",
    actions: ["列清单分解任务", "提前发会议纪要", "预留时间复盘代码"],
  },
  finance: {
    ten_god: "财星",
    reason: "控制风险与仓位，避免冲动。",
    actions: ["写下交易前提", "降低试错仓位", "仅观察清单不追高"],
  },
  relationship: {
    ten_god: "比劫",
    reason: "人际需要界限与倾听，减少摩擦。",
    actions: ["先倾听再回应", "明确一个小请求", "给对方留台阶"],
  },
  life: {
    ten_god: "食伤",
    reason: "作息与恢复优先，避免过劳。",
    actions: ["每小时起身走动", "睡前30分钟断屏", "简单整理桌面"],
  },
};

const BACKUPS = {
  career: [
    "写清今日交付物",
    "发会议议程",
    "先合并小PR",
    "对齐需求边界",
    "写风险清单",
    "留出复盘时间",
  ],
  finance: [
    "写交易计划",
    "缩小试错仓位",
    "只做观察清单",
    "设定止损规则",
    "记录一笔复盘",
    "避免追涨杀跌",
  ],
  relationship: [
    "先倾听再回应",
    "明确一个小请求",
    "把情绪说感受",
    "约10分钟散步聊",
    "给对方留台阶",
    "避免冷处理",
  ],
  life: [
    "每小时起身拉伸",
    "睡前30分钟断屏",
    "补水走两圈",
    "肩颈放松5分钟",
    "午后晒太阳",
    "整理桌面5分钟",
  ],
} as const;

type CategoryLabel = "上班" | "财运" | "人际" | "生活";
const CATEGORY_ORDER: CategoryLabel[] = ["上班", "财运", "人际", "生活"];
const CATEGORY_PLACEHOLDERS: Record<CategoryLabel, string> = {
  上班: "上班：【】（未生成）",
  财运: "财运：【】（未生成）",
  人际: "人际：【】（未生成）",
  生活: "生活：【】（未生成）",
};

const LABEL_REGEX = new RegExp(`^(${CATEGORY_ORDER.join("|")})[:：]`);
const BULLET_PREFIX_REGEX = /^[•\-\u2022\*0-9\.\s]+/;

function cleanBulletText(value: string) {
  return value
    .replace(BULLET_PREFIX_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompactBullets(bullets: string[] = []): string[] {
  const cleaned = bullets.map((item) => cleanBulletText(item)).filter(Boolean);
  const labelMap = new Map<CategoryLabel, string>();
  const unlabeled: string[] = [];

  cleaned.forEach((text) => {
    const match = text.match(LABEL_REGEX);
    if (match) {
      const label = match[1] as CategoryLabel;
      if (!labelMap.has(label)) {
        labelMap.set(label, text);
        return;
      }
    }
    unlabeled.push(text);
  });

  const result: string[] = [];
  CATEGORY_ORDER.forEach((category) => {
    if (labelMap.has(category)) {
      result.push(labelMap.get(category)!);
    } else if (unlabeled.length > 0) {
      result.push(unlabeled.shift()!);
    } else {
      result.push(CATEGORY_PLACEHOLDERS[category]);
    }
  });

  return result.slice(0, 4);
}

function ensureCompactDayBullets(day: any) {
  if (!day) return;
  if (!Array.isArray(day.bullets)) return;
  const mapped = day.bullets.map((item: unknown) => bulletToString(item));
  day.bullets = normalizeCompactBullets(mapped);
}

type SchemaVariant = "compact" | "ten_god" | "legacy";

interface NormalizeMeta {
  schemaVariant: SchemaVariant;
  usedDefaults: boolean;
  missingPaths: string[];
}

function dedupeActions(categories: Record<string, { actions: string[] }>) {
  const used = new Set<string>();
  (["career", "finance", "relationship", "life"] as const).forEach((key) => {
    const acts = categories[key].actions;
    const nextPool = BACKUPS[key];
    for (let i = 0; i < acts.length; i++) {
      if (used.has(acts[i])) {
        const replacement = nextPool.find((p: string) => !used.has(p));
        if (replacement) acts[i] = replacement;
      }
      used.add(acts[i]);
    }
    // ensure 3 unique
    while (acts.length < 3) {
      const replacement = nextPool.find((p: string) => !used.has(p)) || nextPool[0];
      acts.push(replacement);
      used.add(replacement);
    }
  });
}

function normalizeCategory(
  raw: any,
  key: keyof typeof CATEGORY_DEFAULTS,
  meta: NormalizeMeta
) {
  const normalizeTenGod = (value: string | undefined) => {
    if (!value || typeof value !== "string") return null;
    const v = value.trim();
    const map: Record<string, string> = {
      偏印: "偏印",
      正印: "偏印",
      印星: "偏印",
      印: "偏印",
      正官: "正官",
      七杀: "正官",
      杀: "正官",
      官: "正官",
      食伤: "食伤",
      伤官: "食伤",
      食神: "食伤",
      财星: "财星",
      偏财: "财星",
      正财: "财星",
      财: "财星",
      比劫: "比劫",
      劫财: "比劫",
      比肩: "比劫",
    };
    return map[v] || null;
  };

  const fallback = CATEGORY_DEFAULTS[key];
  let usedDefault = false;
  const tenGodMapped = normalizeTenGod(raw?.ten_god);
  const ten_god = tenGodMapped || ((usedDefault = true), fallback.ten_god);
  const reason =
    typeof raw?.reason === "string" && raw.reason.trim() ? raw.reason : ((usedDefault = true), fallback.reason);
  const actionsRaw = Array.isArray(raw?.actions) ? raw.actions : [];
  const actions = actionsRaw
    .map((a: string) => (typeof a === "string" ? a.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
  if (actions.length < 3) usedDefault = true;
  while (actions.length < 3) {
    const next = fallback.actions[actions.length] || fallback.actions[0];
    actions.push(next);
  }
  if (usedDefault) {
    meta.usedDefaults = true;
    meta.missingPaths.push(`day.${key}`);
  }
  return { ten_god, reason, actions };
}

function normalizeDay(raw: any = {}, meta: NormalizeMeta) {
  const isNew = !!raw?.career?.ten_god || !!raw?.career?.reason;
  if (isNew) {
    const day = {
      summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary : DEFAULT_TEXT,
      logic: typeof raw.logic === "string" && raw.logic.trim() ? raw.logic : DEFAULT_TEXT,
      career: normalizeCategory(raw.career, "career", meta),
      finance: normalizeCategory(raw.finance, "finance", meta),
      relationship: normalizeCategory(raw.relationship, "relationship", meta),
      life: normalizeCategory(raw.life, "life", meta),
      note:
        typeof raw.note === "string" && raw.note.trim()
          ? raw.note
          : "未供时辰，仅以年柱与月令中性取象判断。",
    };
    dedupeActions({
      career: day.career,
      finance: day.finance,
      relationship: day.relationship,
      life: day.life,
    });
    return day;
  }

  meta.schemaVariant = "legacy";
  const legacyReason = (v: any, path: string) => {
    if (typeof v === "string" && v.trim()) return v.trim();
    meta.usedDefaults = true;
    meta.missingPaths.push(path);
    return DEFAULT_TEXT;
  };
  const actionsFrom = (arr: any, path: string) => {
    if (!Array.isArray(arr) || arr.length === 0) {
      meta.usedDefaults = true;
      meta.missingPaths.push(path);
      return [];
    }
    return arr.map((v: any) => (typeof v === "string" ? v : String(v))).filter(Boolean);
  };

  const day = {
    summary: legacyReason(raw.description || raw.summary, "day.summary"),
    logic: legacyReason(raw.description || raw.summary, "day.logic"),
    career: normalizeCategory({ reason: raw.career, actions: actionsFrom(raw.do, "day.do") }, "career", meta),
    finance: normalizeCategory({ reason: raw.finance, actions: actionsFrom(raw.do, "day.do") }, "finance", meta),
    relationship: normalizeCategory(
      { reason: raw.relationship, actions: actionsFrom(raw.do, "day.do") },
      "relationship",
      meta
    ),
    life: normalizeCategory(
      { reason: raw.health || raw.social, actions: actionsFrom(raw.do, "day.do") },
      "life",
      meta
    ),
    note:
      typeof raw.note === "string" && raw.note.trim()
        ? raw.note
        : "未供时辰，仅以年柱与月令中性取象判断。",
  };
  dedupeActions({
    career: day.career,
    finance: day.finance,
    relationship: day.relationship,
    life: day.life,
  });
  return day;
}

const DEFAULT_SAFE: Partial<FortuneModelPayload> = {
  summary_line: "今日：稳中求进，先做可控的事。",
  key_tip: "先判断因，再落地行动。",
  disclaimer: "本功能仅供娱乐参考，不构成医疗或投资建议。",
};

export interface NormalizeResult {
  payload: FortuneModelPayload & { dayCompact?: { headline: string; bullets: string[] } };
  meta: NormalizeMeta;
}

export function normalizeFortunePayload(
  raw: any,
  variant: "compact" | "ten_god" | "legacy" = "ten_god"
): NormalizeResult {
  const meta: NormalizeMeta = {
    schemaVariant: variant,
    usedDefaults: false,
    missingPaths: [],
  };
  const normalized: any = {
    ...DEFAULT_SAFE,
    ...raw,
  };

  ensureCompactDayBullets(normalized.day);

  // Compact variant: trust the compact day, just clean bullets
  if (variant === "compact" && normalized.day?.headline && Array.isArray(normalized.day?.bullets)) {
    const bullets = normalizeCompactBullets(normalized.day.bullets);
    normalized.dayCompact = {
      headline: typeof normalized.day.headline === "string" ? normalized.day.headline : "专注主线，少添新事。",
      bullets,
    };
    normalized.day = normalized.dayCompact;
    return { payload: normalized as FortuneModelPayload & { dayCompact: { headline: string; bullets: string[] } }, meta };
  }

  normalized.day = normalizeDay(normalized.day, meta);
  if (normalized.month) normalized.month = normalizeDay(normalized.month, meta);
  if (normalized.year) normalized.year = normalizeDay(normalized.year, meta);

  // Build compact representation from normalized day (detailed/legacy)
  const compactBullets: string[] = [];
  const labels = [
    { key: "career", label: "上班" },
    { key: "finance", label: "财运" },
    { key: "relationship", label: "人际" },
    { key: "life", label: "生活" },
  ] as const;
  labels.forEach((item) => {
    const cat = (normalized.day as any)[item.key];
    if (cat?.ten_god && Array.isArray(cat.actions) && cat.actions.length > 0) {
      compactBullets.push(`${item.label}：${cat.ten_god}，${cat.actions[0]}`.slice(0, 22));
    } else {
      meta.usedDefaults = true;
      meta.missingPaths.push(`day.${item.key}.actions`);
      const fallback = BACKUPS[item.key][0];
      const fallbackGod = CATEGORY_DEFAULTS[item.key].ten_god;
      compactBullets.push(`${item.label}：${fallbackGod}，${fallback}`.slice(0, 22));
    }
  });
  const normalizedBullets = normalizeCompactBullets(compactBullets);
  normalized.dayCompact = {
    headline:
      (normalized.day as any).summary ||
      (normalized.summary_line as any) ||
      "专注主线，少添新事。",
    bullets: normalizedBullets,
  };
  normalized.day = normalized.dayCompact;

  return { payload: normalized as FortuneModelPayload & { dayCompact: { headline: string; bullets: string[] } }, meta };
}
