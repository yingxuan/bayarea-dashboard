import { GoogleGenerativeAI } from "@google/generative-ai";

import { SYSTEM_PROMPT, buildFortuneUserPrompt } from "./prompt.js";
import { FlatFortunePayload, normalizeFortunePayload } from "./normalize.js";
import { extractJsonObject } from "./json.js";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

if (!API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable for fortune API.");
}

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
};

const genai = new GoogleGenerativeAI(API_KEY);

function getModel() {
  return genai.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig,
  });
}

const REPAIR_MAX_LENGTH = 4000;

function snippet(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

function isNoJsonError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("无法在模型输出中找到 JSON 对象");
}

async function defaultRepairToJson(rawText: string): Promise<string> {
  const truncated =
    rawText.length <= REPAIR_MAX_LENGTH ? rawText : rawText.slice(0, REPAIR_MAX_LENGTH);
  const prompt = `Convert the text below into EXACTLY ONE JSON object that matches this schema:\n{ "headline": string, "verdict": string, "do": string, "dont": string, "timeHint": string, "importance": "high"|"medium"|"low" }\nRules:\n- Output ONLY minified JSON. No markdown. No code fences. No extra text.\n- Do NOT recompute or change meaning. Only reformat.\n- If a field is missing, infer a concise value consistent with the text.\nText:\n<<<RAW_TEXT>>>\n`.replace("<<<RAW_TEXT>>>", truncated);

  const model = genai.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig,
  });
  const result = await model.generateContent({
    contents: [
      {
        role: "system",
        parts: [{ text: "You are a strict JSON formatter." }],
      },
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  });
  return result.response.text();
}

let repairOverride: ((rawText: string) => Promise<string>) | null = null;

export function overrideRepairModel(fn: (rawText: string) => Promise<string>) {
  repairOverride = fn;
}

export function clearRepairOverride() {
  repairOverride = null;
}

async function repairToJson(rawText: string): Promise<string> {
  const runner = repairOverride ?? defaultRepairToJson;
  return runner(rawText);
}

function parseJson(text: string) {
  const jsonText = extractJsonObject(text);
  const payload = JSON.parse(jsonText);
  const { payload: normalized, meta } = normalizeFortunePayload(payload);
  return { parsed: normalized, meta };
}

async function parseResponse(text: string, birthdate: string, todayLabel: string) {
  try {
    console.log("[fortune] raw response snippet", text.slice(0, 200));
    return parseJson(text);
  } catch (error) {
    if (isNoJsonError(error)) {
      console.log("[fortune] repair pass used");
      return repairAndParse(text, birthdate, todayLabel);
    }
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Gemini response parsing failed: ${message}`);
  }
}

async function repairAndParse(text: string, birthdate: string, todayLabel: string) {
  const response2 = await repairToJson(text);
  try {
    return parseJson(response2);
  } catch (repairError) {
    const snippet1 = snippet(text);
    const snippet2 = snippet(response2);
    const detail = repairError instanceof Error ? repairError.message : "unknown error";
    throw new Error(
      `Gemini repair failed (${detail}) response1=${snippet1} response2=${snippet2}`
    );
  }
}
export interface FortunePromptArgs {
  birthEightChar: string;
  todayDate: string;
  lunarDate: string;
  yesterdayDate: string;
  next3Days: string;
}

export async function generateFortune(
  birthdate: string,
  todayLabel: string,
  promptArgs: FortunePromptArgs
): Promise<{
  parsed: FlatFortunePayload;
  meta: { schemaVariant: "flat" | "legacy"; usedDefaults: boolean; missingPaths: string[] };
}> {
  const prompt = buildFortuneUserPrompt(
    promptArgs.birthEightChar,
    promptArgs.todayDate,
    promptArgs.lunarDate,
    promptArgs.yesterdayDate,
    promptArgs.next3Days
  );
  const model = getModel();
  const result = await model.generateContent({
    contents: [
      {
        role: "system",
        parts: [{ text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  });
  const text = result.response.text();
  return await parseResponse(text, birthdate, todayLabel);
}

async function runRepairTests() {
  const cases = [
    {
      name: "pure",
      text: '{"headline":"A","verdict":"B","do":"C","dont":"D","timeHint":"E","importance":"high"}',
      expectRepair: false,
    },
    {
      name: "fenced",
      text: "```json\n{\"headline\":\"A\",\"verdict\":\"B\",\"do\":\"C\",\"dont\":\"D\",\"timeHint\":\"E\",\"importance\":\"high\"}\n```",
      expectRepair: false,
    },
    {
      name: "repair",
      text:
        "- **今日一句断语**\n今天是...",
      expectRepair: true,
    },
  ];

  for (const { name, text, expectRepair } of cases) {
    let repairUsed = 0;
    if (expectRepair) {
      overrideRepairModel(async () => {
        repairUsed += 1;
        return '{"headline":"X","verdict":"Y","do":"Z","dont":"W","timeHint":"T","importance":"medium"}';
      });
    } else {
      clearRepairOverride();
    }
    await parseResponse(text, "1990-01-01", "2024-01-01");
    if (expectRepair && repairUsed !== 1) {
      throw new Error(`[gemini.test] ${name} expected repair but none`);
    }
    if (!expectRepair && repairUsed !== 0) {
      throw new Error(`[gemini.test] ${name} unexpected repair`);
    }
    console.log(`[gemini.test] ${name} OK`);
  }
  clearRepairOverride();
  process.exit(0);
}

if (process.env.GEMINI_REPAIR_TEST === "1") {
  runRepairTests().catch((error) => {
    console.error("[gemini.test] failed", error);
    process.exit(1);
  });
}
