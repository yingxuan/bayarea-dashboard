export function bulletToString(item: unknown): string {
  if (typeof item === "string") {
    return item.trim();
  }

  if (typeof item === "object" && item !== null) {
    const label = String((item as any).label || (item as any).category || (item as any).section || "").trim();
    const tag = String((item as any).tag || (item as any).ten_god || (item as any).tenGod || "").trim();
    const text = String(
      (item as any).text ||
        (item as any).tip ||
        (item as any).reminder ||
        (item as any).note ||
        (item as any).message ||
        ""
    ).trim();

    const parts: string[] = [];
    if (label) {
      parts.push(`${label}：`);
    }
    if (tag) {
      parts.push(`【${tag}】`);
    }
    if (text) {
      parts.push(text);
    }

    const composed = parts.join("").trim();
    return composed || JSON.stringify(item);
  }

  return String(item ?? "").trim();
}

export function coerceDayBulletsToStrings(input: any): any {
  if (!input || typeof input !== "object") {
    return input;
  }

  const day = input.day;
  if (!day || typeof day !== "object") {
    return input;
  }

  const bullets = day.bullets;
  if (!Array.isArray(bullets)) {
    return input;
  }

  const mapped = bullets.map((b) => bulletToString(b));
  input.day = { ...day, bullets: mapped };
  return input;
}
