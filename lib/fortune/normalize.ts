import { fortuneFlatSchema, fortuneLegacySchema } from "./schema.js";
import { z } from "zod";

export interface FlatFortunePayload {
  headline: string;
  verdict: string;
  do: string;
  dont: string;
  timeHint: string;
  importance: "high" | "medium" | "low";
}

interface NormalizeMeta {
  schemaVariant: "flat" | "legacy";
  usedDefaults: boolean;
  missingPaths: string[];
}

function normalizeLegacy(raw: z.infer<typeof fortuneLegacySchema>): FlatFortunePayload {
  const day = raw.day || {};
  const headline = raw.summary_line || day.summary || raw.key_tip || "今日无重点";
  const verdict = day.logic || day.summary || raw.key_tip || "先判断，再行动";
  const doAction = Array.isArray(day?.do) && day.do.length > 0 ? day.do[0] : "先整理待办";
  const dontAction = Array.isArray(day?.avoid) && day.avoid.length > 0 ? day.avoid[0] : "避免冲动操作";
  const timeHint = day.note || "今日无关键窗口";
  return {
    headline,
    verdict,
    do: doAction,
    dont: dontAction,
    timeHint,
    importance: "medium",
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
  const flatParse = fortuneFlatSchema.safeParse(raw);
  if (flatParse.success) {
    return { payload: flatParse.data, meta };
  }
  const legacyParse = fortuneLegacySchema.safeParse(raw);
  if (legacyParse.success) {
    meta.schemaVariant = "legacy";
    return { payload: normalizeLegacy(legacyParse.data), meta };
  }
  throw new Error("输入不符合任何支持的 fortune schema");
}
