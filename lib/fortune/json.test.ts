import { describe, expect, it } from "vitest";

import { extractJsonObject } from "./json.js";
import { formatDateLA } from "./date.js";

const sampleJson = '{"hello":"world"}';

describe("extractJsonObject", () => {
  it("returns pure JSON unchanged", () => {
    expect(extractJsonObject(sampleJson)).toBe(sampleJson);
  });

  it("handles ```json fenced output", () => {
    const wrapped = "```json\n{\"a\":1}\n```";
    expect(extractJsonObject(wrapped)).toBe('{"a":1}');
  });

  it("handles generic ``` fence", () => {
    const wrapped = "```\n{\"b\":2}\n```";
    expect(extractJsonObject(wrapped)).toBe('{"b":2}');
  });

  it("extracts JSON from surrounding text", () => {
    const text = "Notice:\n{\"c\":3}\nEnd.";
    expect(extractJsonObject(text)).toBe('{"c":3}');
  });

  it("throws when no braces present", () => {
    expect(() => extractJsonObject("no json here")).toThrow("无法在模型输出中找到 JSON 对象");
  });

  it("formats LA date", () => {
    const d = new Date("2026-01-11T10:00:00Z");
    expect(formatDateLA(d)).toBe("2026-01-11");
  });
});
