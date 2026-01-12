import { describe, expect, it } from "vitest";

import { normalizeFortunePayload } from "./normalize.js";

const DEFAULT_LUCKY = {
  color: "赤金",
  number: "8",
  direction: "正南",
  time_range: "上午",
};

const basePayload = {
  birthdate: "1990-05-01",
  timezone: "America/Los_Angeles",
  today: "2026-01-11",
  generated_at: "2026-01-11T15:00:00Z",
  summary_line: "今日：事业 ★★★★☆｜财运 ★★★☆☆｜感情 ★★★★☆",
  key_tip: "早睡早起，才有精力打怪。",
  disclaimer: "本功能仅供娱乐参考，不构成医疗或投资建议。",
};

describe("normalizeFortunePayload", () => {
  it("handles legacy wealth/overall keys", () => {
    const payload = {
      ...basePayload,
      day: {
        scores: { career: 4, health: 3, relationship: 2, wealth: 5, social: 3 },
        overall: "今天适合沉下心做事。",
        career: "事业吉，但别急于表态。",
        health: "口腔警示，少糖。",
        relationship: "靠谱朋友在身边。",
        wealth: "积蓄略有补充。",
        social: "吃饭聚会则尽量早些脱身。",
        do: ["安排会议", "补充睡眠", "回顾目标"],
        avoid: ["冲动投资", "熬夜", "情绪化沟通"],
        lucky: { color: "紫", number: "6", direction: "东南", time_range: "上午" },
      },
      month: {
        scores: { career: 3, health: 4, relationship: 4, finance: 3, social: 4 },
        description: "本月逐步展开，会有稳步节奏。",
        career: "把握住项目中的小机会。",
        health: "坚持动一动。",
        relationship: "互相体谅更容易奏效。",
        finance: "收支需再微调。",
        social: "多参加小范围聚会。",
        do: ["记录花销", "用餐规律", "主动问候"],
        avoid: ["盲目攀比", "继续熬夜", "过度吹毛求疵"],
        lucky: { color: "蓝", number: "2", direction: "正北", time_range: "下午" },
      },
      year: {
        scores: { career: 4, health: 3, relationship: 3, wealth: 4, social: 3 },
        description: "流年尚可，稳步向前。",
        career: "目光放远，学新技能。",
        health: "注意腰背，适当拉伸。",
        relationship: "家人支持度高。",
        wealth: "储蓄可再安排。",
        social: "不必过度争辩。",
        do: ["设定年度目标", "体检一轮", "保留独处时间"],
        avoid: ["焦虑情绪", "长期熬夜", "借钱给陌生人"],
        lucky: { color: "棕", number: "5", direction: "西南", time_range: "傍晚" },
      },
    };

    const normalized = normalizeFortunePayload(payload);
    expect(normalized.day.scores.finance).toBe(5);
    expect(normalized.day.description).toBe("今天适合沉下心做事。");
    expect(normalized.month.description.startsWith("本月")).toBe(true);
  });

  it("fills defaults when finance missing", () => {
    const payload = {
      ...basePayload,
      day: {
        scores: { career: 5, health: 4, relationship: 3, social: 4 },
        description: "描述存在",
        career: "career",
        health: "health",
        relationship: "relationship",
        social: "social",
        do: ["a", "b", "c"],
        avoid: ["x", "y", "z"],
        lucky: DEFAULT_LUCKY,
      },
      month: { scores: {}, description: "", career: "", health: "", relationship: "", finance: "", social: "", do: [], avoid: [], lucky: {} },
      year: { scores: {}, description: "", career: "", health: "", relationship: "", finance: "", social: "", do: [], avoid: [], lucky: {} },
    };

    const normalized = normalizeFortunePayload(payload);
    expect(normalized.day.scores.finance).toBe(3);
    expect(normalized.day.finance).toBe("（生成缺失，已用默认文案）");
    expect(normalized.month.do.length).toBe(3);
    expect(normalized.year.lucky.color).toBe("赤金");
  });

  it("passes through already correct payload", () => {
    const payload = {
      ...basePayload,
      day: {
        scores: { career: 4, health: 4, relationship: 4, finance: 4, social: 4 },
        description: "稳定",
        career: "career",
        health: "health",
        relationship: "relationship",
        finance: "finance",
        social: "social",
        do: ["a", "b", "c"],
        avoid: ["x", "y", "z"],
        lucky: { color: "金", number: "7", direction: "东", time_range: "上午" },
      },
      month: {
        scores: { career: 3, health: 3, relationship: 3, finance: 3, social: 3 },
        description: "平稳",
        career: "c",
        health: "h",
        relationship: "r",
        finance: "f",
        social: "s",
        do: ["d1", "d2", "d3"],
        avoid: ["a1", "a2", "a3"],
        lucky: { color: "红", number: "9", direction: "西", time_range: "下午" },
      },
      year: {
        scores: { career: 5, health: 5, relationship: 5, finance: 5, social: 5 },
        description: "向上",
        career: "c",
        health: "h",
        relationship: "r",
        finance: "f",
        social: "s",
        do: ["d1", "d2", "d3"],
        avoid: ["a1", "a2", "a3"],
        lucky: { color: "紫", number: "3", direction: "东南", time_range: "晚上" },
      },
    };

    const normalized = normalizeFortunePayload(payload);
    expect(normalized.day.description).toBe("稳定");
    expect(normalized.month.scores.career).toBe(3);
    expect(normalized.year.lucky.number).toBe("3");
  });

  it("preserves ten_god schema and fills missing actions minimally", () => {
    const payload = {
      birthdate: "1990-05-01",
      summary_line: "test",
      key_tip: "tip",
      disclaimer: "disc",
      day: {
        summary: "sum",
        logic: "logic",
        career: { ten_god: "偏印", reason: "技术逻辑", actions: ["A", "B", "C"] },
        finance: { ten_god: "财星", reason: "风险控制", actions: ["F1"] },
        relationship: { ten_god: "比劫", reason: "人际", actions: ["R1", "R2", "R3"] },
        life: { ten_god: "食伤", reason: "作息", actions: ["L1", "L2", "L3"] },
        note: "note",
      },
    };
    const { payload: normalized, meta } = normalizeFortunePayload(payload);
    expect(meta.schemaVariant).toBe("ten_god");
    expect(normalized.day.finance.actions.length).toBe(3);
    expect(normalized.day.career.actions[0]).toBe("A");
    expect(meta.usedDefaults).toBe(true);
  });
});

const DEFAULT_LUCKY = {
  color: "赤金",
  number: "8",
  direction: "正南",
  time_range: "上午",
};
