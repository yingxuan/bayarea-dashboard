import { describe, expect, it } from "vitest";

import { normalizeFortunePayload } from "./normalize.js";

const defaultRadar = {
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

describe("normalizeFortunePayload", () => {
  it("passes through flat payload unchanged", () => {
    const payload = {
      headline: "今日忙碌",
      verdict: "需要快速决断",
      do: "梳理关键事项",
      dont: "避免扩张",
      timeHint: "10-11点有窗口",
      importance: "high" as const,
      behaviorRadar: {
        investment: { status: "actionable" as const, summary: "可操作" },
        travel: { status: "safe" as const, summary: "平稳" },
        publicRole: { status: "caution" as const, summary: "留意" },
      },
    };
    const normalized = normalizeFortunePayload(payload);
    expect(normalized.payload).toEqual(payload);
    expect(normalized.meta.schemaVariant).toBe("flat");
    expect(normalized.meta.usedDefaults).toBe(false);
  });

  it("fills default behavior radar when missing", () => {
    const payload = {
      headline: "今日忙碌",
      verdict: "需要快速决断",
      do: "梳理关键事项",
      dont: "避免扩张",
      timeHint: "10-11点有窗口",
      importance: "high" as const,
    };
    const normalized = normalizeFortunePayload(payload);
    expect(normalized.payload.behaviorRadar).toEqual(defaultRadar);
    expect(normalized.meta.usedDefaults).toBe(true);
    expect(normalized.meta.missingPaths).toContain("behaviorRadar");
  });

  it("normalizes legacy payload into flat schema with radar defaults", () => {
    const payload = {
      summary_line: "legacy summary",
      key_tip: "hint",
      day: {
        summary: "日 summary",
        logic: "日逻辑",
        do: ["行动1"],
        avoid: ["禁忌1"],
        note: "某时间窗口",
      },
    };
    const normalized = normalizeFortunePayload(payload);
    expect(normalized.payload.headline).toBe("legacy summary");
    expect(normalized.payload.verdict).toBe("日逻辑");
    expect(normalized.payload.do).toBe("行动1");
    expect(normalized.payload.dont).toBe("禁忌1");
    expect(normalized.payload.timeHint).toBe("某时间窗口");
    expect(normalized.payload.importance).toBe("medium");
    expect(normalized.payload.behaviorRadar).toEqual(defaultRadar);
    expect(normalized.meta.schemaVariant).toBe("legacy");
    expect(normalized.meta.usedDefaults).toBe(true);
  });

  it("throws when payload invalid", () => {
    expect(() => normalizeFortunePayload({ foo: "bar" })).toThrow();
  });
});
