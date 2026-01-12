const TIME_ZONE = "America/Los_Angeles";
function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function buildDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  const year = Number(map.year ?? 0);
  const month = Number(map.month ?? 0);
  const day = Number(map.day ?? 0);
  const hour = Number(map.hour ?? 0);
  const minute = Number(map.minute ?? 0);
  const second = Number(map.second ?? 0);

  return { year, month, day, hour, minute, second };
}

function formatDateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function formatTodayLabel(date: Date) {
  const isoFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const iso = isoFormatter.format(date).replace(" ", "T");
  const zoneFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  });
  const zoneParts = zoneFormatter.formatToParts(date);
  const zone =
    zoneParts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  return `${iso} ${zone} (${TIME_ZONE})`;
}

export interface LosAngelesDateInfo {
  dateKey: string;
  todayLabel: string;
  now: Date;
  ttlMs: number;
}

export function getLosAngelesDateInfo(reference: Date = new Date()): LosAngelesDateInfo {
  const now = reference;
  const parts = buildDateParts(now);

  const laParsed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = now.getTime() - laParsed;
  const midnightParsed = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0);
  const midnightUtc = midnightParsed + offsetMs;
  const ttlUntilMidnight = midnightUtc - now.getTime();
  const ttlMs = Math.max(ttlUntilMidnight, 0);

  return {
    dateKey: formatDateKey(parts),
    todayLabel: formatTodayLabel(now),
    now,
    ttlMs,
  };
}

export function getFortuneCacheKey(birthdate: string, laDateKey: string) {
  return `fortune:${birthdate}:${laDateKey}:America/Los_Angeles`;
}

export const MAX_FORTUNE_TTL_MS = Infinity;

