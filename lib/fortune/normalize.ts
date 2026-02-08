import { behaviorRadarSchema, fortuneFlatSchema, fortuneLegacySchema } from "./schema.js";
import { z } from "zod";

export interface FlatFortunePayload {
  headline: string;
  verdict: string;
  do: string;
  dont: string;
  timeHint: string;
  importance: "high" | "medium" | "low";
  behaviorRadar: z.infer<typeof behaviorRadarSchema>;
}

interface NormalizeMeta {
  schemaVariant: "flat" | "legacy";
  usedDefaults: boolean;
  missingPaths: string[];
}

function createDefaultRadar(): FlatFortunePayload["behaviorRadar"] {
  return {
    investment: {
      status: "none",
      summary: "今日不构成独立交易信号，建议观望。",
    },
    travel: {
      status: "none",
      summary: "今日出行层面未见显著风险信号。",
    },
    publicRole: {
      status: "none",
      summary: "今日无需特别注意公开角色与站位。",
    },
  };
}

function ensureRadar(raw: any): { radar: FlatFortunePayload["behaviorRadar"]; usedDefault: boolean } {
  if (raw && typeof raw === "object") {
    const parsed = behaviorRadarSchema.safeParse(raw);
    if (parsed.success) {
      return { radar: parsed.data, usedDefault: false };
    }
  }
  return { radar: createDefaultRadar(), usedDefault: true };
}

function normalizeLegacy(
  raw: z.infer<typeof fortuneLegacySchema>
): { payload: FlatFortunePayload; usedDefault: boolean } {
  const day = raw.day || {};
  const headline = raw.summary_line || day.summary || raw.key_tip || "今日无重点";
  const verdict = day.logic || day.summary || raw.key_tip || "先判断，再行动";
  // Legacy schema uses category.actions arrays; extract first action from career or finance
  const careerActions = day.career?.actions;
  const financeActions = day.finance?.actions;
  const doAction =
    (Array.isArray(careerActions) && careerActions.length > 0 ? careerActions[0] : null) ||
    (Array.isArray(financeActions) && financeActions.length > 0 ? financeActions[0] : null) ||
    "先整理待办";
  const lifeActions = day.life?.actions;
  const dontAction =
    (Array.isArray(lifeActions) && lifeActions.length > 1 ? lifeActions[1] : null) ||
    "避免冲动操作";
  const timeHint = day.note || "今日无关键窗口";
  const { radar, usedDefault } = ensureRadar(raw.behaviorRadar);
  return {
    payload: {
      headline,
      verdict,
      do: doAction,
      dont: dontAction,
      timeHint,
      importance: "medium",
      behaviorRadar: radar,
    },
    usedDefault,
  };
}

export interface NormalizeResult {
  payload: FlatFortunePayload;
  meta: NormalizeMeta;
}

export function normalizeFortunePayload(raw: any): NormalizeResult {
  const meta: NormalizeMeta = {
    schemaVariant: "flat",
    usedDefaults: false,
    missingPaths: [],
  };
  const { radar, usedDefault } = ensureRadar(raw?.behaviorRadar);
  const flattened = { ...raw, behaviorRadar: radar };
  if (usedDefault) {
    meta.usedDefaults = true;
    meta.missingPaths.push("behaviorRadar");
  }
  const flatParse = fortuneFlatSchema.safeParse(flattened);
  if (flatParse.success) {
    return { payload: flatParse.data, meta };
  }
  const legacyParse = fortuneLegacySchema.safeParse(raw);
  if (legacyParse.success) {
    meta.schemaVariant = "legacy";
    const { payload, usedDefault: legacyUsedDefault } = normalizeLegacy(legacyParse.data);
    if (legacyUsedDefault && !meta.usedDefaults) {
      meta.usedDefaults = true;
      meta.missingPaths.push("behaviorRadar");
    }
    return { payload, meta };
  }
  throw new Error("输入不符合任何支持的 fortune schema");
}
