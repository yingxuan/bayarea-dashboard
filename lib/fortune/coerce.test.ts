import { describe, expect, it } from "vitest";

import { coerceDayBulletsToStrings } from "./coerce.js";
import { normalizeCompactBullets } from "./normalize.js";

describe("coerceDayBulletsToStrings", () => {
  it("converts bullet objects into strings", () => {
    const input = {
      day: {
        bullets: [
          {
            label: "上班",
            tag: "正官",
            text: "今天特别容易在会议里被追问",
          },
        ],
      },
    };

    const result = coerceDayBulletsToStrings(input);
    expect(result.day.bullets).toEqual(["上班：【正官】今天特别容易在会议里被追问"]);
  });

  it("handles mixed string and object bullets", () => {
    const input = {
      day: {
        bullets: [
          "财运：【财星】今天更容易追高",
          {
            label: "人际",
            tag: "比劫",
            text: "今天特别容易被说服",
          },
          "生活：【食伤】今天特别容易把任务做细",
        ],
      },
    };

    const result = coerceDayBulletsToStrings(input);
    expect(result.day.bullets).toEqual([
      "财运：【财星】今天更容易追高",
      "人际：【比劫】今天特别容易被说服",
      "生活：【食伤】今天特别容易把任务做细",
    ]);
  });
});

describe("normalizeCompactBullets", () => {
  it("enforces four entries with placeholders when categories are missing", () => {
    const bullets = ["财运：【财星】今天特别容易追高"];
    const normalized = normalizeCompactBullets(bullets);

    expect(normalized).toHaveLength(4);
    expect(normalized[0]).toBe("上班：【】（未生成）");
    expect(normalized[1]).toBe("财运：【财星】今天特别容易追高");
    expect(normalized[2]).toBe("人际：【】（未生成）");
    expect(normalized[3]).toBe("生活：【】（未生成）");
  });

  it("ignores extra bullets beyond four while preserving order", () => {
    const bullets = [
      "上班：【偏印】今天特别容易自己盖章",
      "财运：【财星】今天更容易冲动加仓",
      "人际：【比劫】今天特别容易硬碰硬",
      "生活：【食伤】今天特别容易断电",
      "多余：【】不该出现",
    ];
    const normalized = normalizeCompactBullets(bullets);

    expect(normalized).toEqual([
      "上班：【偏印】今天特别容易自己盖章",
      "财运：【财星】今天更容易冲动加仓",
      "人际：【比劫】今天特别容易硬碰硬",
      "生活：【食伤】今天特别容易断电",
    ]);
  });
});
