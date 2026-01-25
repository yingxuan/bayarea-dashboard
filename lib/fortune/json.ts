const MAX_LOG_SNIPPET = 200;

function tryParseAndReturn(source: string): string | null {
  try {
    JSON.parse(source);
    return source;
  } catch {
    return null;
  }
}

function logFallback(snippet: string) {
  const normalized = snippet.replace(/\s+/g, " ").trim().slice(0, MAX_LOG_SNIPPET);
  console.info(`[fortune] json_extraction_balanced snippet=${normalized}`);
}

function raiseParseError(strategy: "fenced" | "balanced", raw: string) {
  const snippet = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LOG_SNIPPET);
  throw new Error(
    `无法解析 ${strategy} JSON：${snippet} (${strategy} strategy failed)`
  );
}

function findJsonInFence(text: string): string | null {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = fenceRegex.exec(text);
  if (!match) return null;
  const candidate = match[1].trim();
  if (!candidate) {
    raiseParseError("fenced", text);
  }
  const parsed = tryParseAndReturn(candidate);
  if (!parsed) {
    raiseParseError("fenced", text);
  }
  return parsed;
}

function findBalancedJson(text: string): string | null {
  const length = text.length;
  for (let start = 0; start < length; start++) {
    if (text[start] !== "{") continue;
    let depth = 0;
    for (let end = start; end < length; end++) {
      const char = text[end];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, end + 1).trim();
          if (!candidate) break;
          const parsed = tryParseAndReturn(candidate);
          if (!parsed) {
            raiseParseError("balanced", text);
          }
          logFallback(candidate);
          return candidate;
        }
      }
    }
  }
  return null;
}

export function extractJsonObject(text: string): string {
  const raw = text.trim();
  if (!raw) {
    throw new Error("模型返回为空");
  }

  const fromFence = findJsonInFence(raw);
  if (fromFence) {
    return fromFence;
  }

  const fromBalanced = findBalancedJson(raw);
  if (fromBalanced) {
    return fromBalanced;
  }

  const snippet = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LOG_SNIPPET);
  throw new Error(`无法在模型输出中找到 JSON 对象：${snippet}`);
}

(function runJsonTests() {
  if (process.env.JSON_EXTRACT_TEST !== "1") return;
  const cases = [
    {
      name: "pure",
      text: '{"headline":"A","verdict":"B","do":"C","dont":"D","timeHint":"E","importance":"high"}',
    },
    {
      name: "fenced",
      text: "```json\n{\"headline\":\"A\",\"verdict\":\"B\",\"do\":\"C\",\"dont\":\"D\",\"timeHint\":\"E\",\"importance\":\"high\"}\n```",
    },
    {
      name: "inline",
      text: "今日一句断语\n- blah\n{\"headline\":\"A\",\"verdict\":\"B\",\"do\":\"C\",\"dont\":\"D\",\"timeHint\":\"E\",\"importance\":\"high\"}\n",
    },
  ];
  for (const { name, text } of cases) {
    try {
      const jsonText = extractJsonObject(text);
      JSON.parse(jsonText);
      console.log(`[json.test] ${name} OK`);
    } catch (error) {
      console.error(`[json.test] ${name} FAILED`, error);
      process.exit(1);
    }
  }
  process.exit(0);
})();
