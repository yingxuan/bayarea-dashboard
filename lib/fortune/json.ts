export function extractJsonObject(text: string): string {
  const raw = text.trim();
  if (!raw) {
    throw new Error("模型返回为空");
  }

  let content = raw;

  const fenceMatch = content.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  if (fenceMatch) {
    content = fenceMatch[1];
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || start > end) {
    throw new Error(`无法在模型输出中找到 JSON 对象：${content.slice(0, 100)}`);
  }

  const candidate = content.slice(start, end + 1).trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    throw new Error("提取的内容不是有效的 JSON 对象");
  }

  return candidate;
}
