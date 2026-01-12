import { GoogleGenerativeAI } from "@google/generative-ai";

import { type FortuneModelPayload } from "./schema.js";
import { buildFortunePrompt } from "./prompt.js";
import { normalizeFortunePayload } from "./normalize.js";
import { extractJsonObject } from "./json.js";
import { parseFortunePayload } from "./parse.js";
import { coerceDayBulletsToStrings } from "./coerce.js";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

if (!API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable for fortune API.");
}

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
};

const SYSTEM_INSTRUCTION =
  "You are a fortune-telling assistant that responds only with a single JSON object. " +
  "The JSON must follow the structure described in the user prompt and contain no additional commentary.";

const genai = new GoogleGenerativeAI(API_KEY);

function getModel() {
  return genai.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig,
    systemInstruction: SYSTEM_INSTRUCTION,
  });
}

function parseResponse(text: string, birthdate: string, todayLabel: string) {
  try {
    console.log("[fortune] raw response snippet", text.slice(0, 200));
    const jsonText = extractJsonObject(text);
    const payload = JSON.parse(jsonText);
    const coerced = coerceDayBulletsToStrings(payload);
    const { variant, parsed } = parseFortunePayload(coerced);
    const { payload: normalized, meta } = normalizeFortunePayload(parsed, variant);
    return { parsed: normalized, meta };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Gemini response parsing failed: ${message}`);
  }
}

export async function generateFortune(birthdate: string, todayLabel: string): Promise<{
  parsed: FortuneModelPayload;
  meta: { schemaVariant: string; usedDefaults: boolean; missingPaths: string[] };
}> {
  const prompt = buildFortunePrompt(birthdate, todayLabel);
  const model = getModel();
  const result = await model.generateContent({
    contents: [
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
  return parseResponse(text, birthdate, todayLabel);
}
