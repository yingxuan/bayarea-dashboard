import { describe, expect, it } from "vitest";

import { normalizeFortunePayload } from "./normalize.js";

describe("normalizeFortunePayload", () => {
  it("passes through flat payload unchanged", () => {
    const payload = {
      headline: "今日忙碌",
      verdict: "需要快速决断",
      do: "梳理关键事项",
      dont: "避免扩张",
      timeHint: "10-11点有窗口",
      importance: "high" as const,
    };
    const normalized = normalizeFortunePayload(payload);
    expect(normalized.payload).toEqual(payload);
    expect(normalized.meta.schemaVariant).toBe("flat");
  });

  it("normalizes legacy payload into flat schema", () => {
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
    expect(normalized.meta.schemaVariant).toBe("legacy");
  });

  it("throws when payload invalid", () => {
    expect(() => normalizeFortunePayload({ foo: "bar" })).toThrow();
  });
});
