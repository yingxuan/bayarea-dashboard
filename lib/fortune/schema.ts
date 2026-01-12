import { z } from "zod";

const categorySchema = z.object({
  ten_god: z.string().min(1),
  reason: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1),
});

// Ten-god detailed schema (model input)
const daySchemaTenGod = z.object({
  summary: z.string().min(1),
  logic: z.string().min(1),
  career: categorySchema,
  finance: categorySchema,
  relationship: categorySchema,
  life: categorySchema,
  note: z.string().min(1),
});

// Legacy schema support
const scoreSchema = z.number().int().min(1).max(5);
const luckySchema = z.object({
  color: z.string().min(1),
  number: z.string().min(1),
  direction: z.string().min(1),
  time_range: z.string().min(1),
});
const periodSchemaLegacy = z.object({
  description: z.string().min(1),
  scores: z.object({
    career: scoreSchema,
    health: scoreSchema,
    relationship: scoreSchema,
    finance: scoreSchema,
    social: scoreSchema,
  }),
  career: z.string().min(1),
  health: z.string().min(1),
  relationship: z.string().min(1),
  finance: z.string().min(1),
  social: z.string().min(1),
  do: z.array(z.string().min(1)).min(3),
  avoid: z.array(z.string().min(1)).min(3),
  lucky: luckySchema,
});

// Compact day schema (LLM may return directly)
export const compactDaySchema = z
  .object({
    day: z.object({
      headline: z.string().min(1),
      bullets: z.array(z.string()).length(4),
    }),
  })
  .passthrough();

// Ten-god payload schema (LLM output)
export const tenGodPayloadSchema = z
  .object({
    generated_at: z.string().optional(),
    summary_line: z.string().min(1),
    key_tip: z.string().min(1).max(60),
    day: daySchemaTenGod,
    month: daySchemaTenGod.optional(),
    year: daySchemaTenGod.optional(),
    disclaimer: z.string().min(1).optional(),
  })
  .passthrough();

// Legacy payload schema (LLM output)
export const legacyPayloadSchema = z
  .object({
    generated_at: z.string().optional(),
    summary_line: z.string().min(1),
    key_tip: z.string().min(1).max(60),
    day: periodSchemaLegacy,
    month: periodSchemaLegacy.optional(),
    year: periodSchemaLegacy.optional(),
    disclaimer: z.string().min(1).optional(),
  })
  .passthrough();

// Final API response schema (server-owned today/timezone) with derived compact view.
export const dayCompactSchema = z.object({
  headline: z.string().min(1),
  bullets: z.array(z.string().min(1)).length(4),
});

export const fortuneResponseSchema = z
  .object({
    birthdate: z.string().min(1),
    timezone: z.string().min(1),
    today: z.string().min(1),
    generated_at: z.string(),
    summary_line: z.string().min(1),
    key_tip: z.string().min(1).max(60),
    day: dayCompactSchema,
    disclaimer: z.string().min(1),
    meta: z.any().optional(),
  })
  .passthrough();

export type CompactDayPayload = z.infer<typeof compactDaySchema>;
export type TenGodPayload = z.infer<typeof tenGodPayloadSchema>;
export type LegacyPayload = z.infer<typeof legacyPayloadSchema>;
export type DayCompact = z.infer<typeof dayCompactSchema>;
export type FortuneResponse = z.infer<typeof fortuneResponseSchema>;
export type FortuneModelPayload = CompactDayPayload | TenGodPayload | LegacyPayload;