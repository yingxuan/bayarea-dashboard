import type { VercelRequest, VercelResponse } from "@vercel/node";

type OpenHouseListing = {
  address: string;
  streetAddress: string;
  price: string;
  beds: string;
  baths: string;
  size: string;
  middleSchool: string;
  highSchool: string;
  schedule: string;
  image: string;
  url: string;
};

const DEFAULT_ZIPS = ["95014", "94043", "94087", "95129", "94539"];
const CACHE_TTL_MS = 20 * 60 * 1000;

const cache = new Map<string, { updatedAt: number; items: OpenHouseListing[] }>();

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.redfin.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`redfin ${response.status}`);
  }

  return response.text();
}

function extractUniqueListingUrls(html: string, limit: number) {
  const mainSection =
    html.split("Nearby homes that match your criteria")[0] ||
    html.split("Viewing page 1 of 1")[0] ||
    html;

  const matches = mainSection.matchAll(/href="(\/(?:CA)\/[^"]+\/home\/\d+)"/g);
  const unique = new Set<string>();

  for (const match of matches) {
    const href = match[1];
    if (!href) continue;
    unique.add(`https://www.redfin.com${href}`);
    if (unique.size >= limit) break;
  }

  return Array.from(unique);
}

function extractMetaImage(html: string) {
  const match =
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html) ||
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i.exec(html);
  return match?.[1] || "";
}

function normalizeScheduleDay(day: string) {
  const cleaned = day.trim().replace(/\.$/, "");
  const map: Record<string, string> = {
    monday: "Mon",
    mon: "Mon",
    tuesday: "Tue",
    tue: "Tue",
    tues: "Tue",
    wednesday: "Wed",
    wed: "Wed",
    thursday: "Thu",
    thu: "Thu",
    thur: "Thu",
    thurs: "Thu",
    friday: "Fri",
    fri: "Fri",
    saturday: "Sat",
    sat: "Sat",
    sunday: "Sun",
    sun: "Sun",
  };

  return map[cleaned.toLowerCase()] || cleaned;
}

function normalizeScheduleTime(time: string) {
  return time.trim().replace(/\s+/g, "").toUpperCase();
}

function parseTimeParts(value: string) {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(value.trim());
  if (!match) return null;

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2] || 0);
  if (match[3].toUpperCase() === "PM") hours += 12;
  return { hours, minutes };
}

function buildScheduleDate(base: Date, time: string) {
  const parts = parseTimeParts(time);
  if (!parts) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), parts.hours, parts.minutes, 0, 0);
}

function getUpcomingWeekday(base: Date, weekdayToken: string) {
  const weekdayMap: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };
  const target = weekdayMap[weekdayToken.toLowerCase()];
  if (target === undefined) return null;

  const next = new Date(base);
  const delta = (target - base.getDay() + 7) % 7;
  next.setDate(base.getDate() + delta);
  return next;
}

function extractSchedule(text: string) {
  const now = new Date();

  const datedMatch =
    /Open houses?\s+([A-Za-z]+),\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i.exec(
      text,
    ) ||
    /OPEN\s+([A-Za-z]+),\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|TO)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i.exec(
      text,
    );

  if (datedMatch) {
    const [, weekday, monthToken, dayRaw, startRaw, endRaw] = datedMatch;
    const monthIndex = new Date(`${monthToken} 1, ${now.getFullYear()}`).getMonth();
    const base = new Date(now.getFullYear(), monthIndex, Number(dayRaw));
    const endAt = buildScheduleDate(base, endRaw);
    if (endAt && endAt.getTime() < now.getTime()) return null;

    return `${weekday}, ${monthToken} ${dayRaw} · ${normalizeScheduleTime(startRaw)}-${normalizeScheduleTime(endRaw)}`;
  }

  const compactMatch =
    /OPEN\s+([A-Za-z]{3,9})(?:,\s*([A-Za-z]{3})\s+(\d{1,2}))?[A-Z,\s\d]{0,8}(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|TO)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i.exec(
      text,
    ) ||
    /Open\s+([A-Za-z]{3,9})(?:,\s*([A-Za-z]{3})\s+(\d{1,2}))?[A-Z,\s\d]{0,8}(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i.exec(
      text,
    );

  if (compactMatch) {
    const [, weekdayToken, monthToken, dayRaw, startRaw, endRaw] = compactMatch;
    let base: Date | null = null;

    if (monthToken && dayRaw) {
      const monthIndex = new Date(`${monthToken} 1, ${now.getFullYear()}`).getMonth();
      base = new Date(now.getFullYear(), monthIndex, Number(dayRaw));
    } else {
      base = getUpcomingWeekday(now, weekdayToken);
    }

    if (!base) return null;

    const endAt = buildScheduleDate(base, endRaw);
    if (endAt && endAt.getTime() < now.getTime()) return null;

    return `${normalizeScheduleDay(weekdayToken)} ${normalizeScheduleTime(startRaw)}-${normalizeScheduleTime(endRaw)}`;
  }

  return null;
}

function extractSchool(text: string, kind: "middle" | "high") {
  const pattern =
    kind === "middle"
      ? /([A-Za-z0-9.' -]+Middle School)\s+Public\s+6-8\s+.*?Assigned/i
      : /([A-Za-z0-9.' -]+High School)\s+Public\s+9-12\s+.*?Assigned/i;

  return text.match(pattern)?.[1]?.trim() || "Assigned school on Redfin";
}

function parseListingPage(url: string, html: string): OpenHouseListing | null {
  const text = stripHtml(html);
  const lowerText = text.toLowerCase();

  if (
    /\b(sold|closed sale|off market|pending|pending sale|sale pending|contingent|under contract|accepting backup offers)\b/i.test(
      text,
    ) ||
    lowerText.includes("this home last sold") ||
    lowerText.includes("recently sold") ||
    lowerText.includes("no longer for sale") ||
    lowerText.includes("is not for sale") ||
    lowerText.includes("currently off market")
  ) {
    return null;
  }

  const topMatch =
    /For sale\s+\$([\d,]+)[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*bd[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*ba[\s\S]{0,30}?([\d,]+)\s*sq ft[\s\S]{0,120}?#\s*([^#]+?,\s*[A-Za-z .'-]+,\s*CA\s*\d{5})/i.exec(
      text,
    );

  if (!topMatch) return null;

  const schedule = extractSchedule(text);
  if (!schedule) return null;

  const [, priceRaw, bedsRaw, bathsRaw, sizeRaw, address] = topMatch;
  const streetAddress = address.split(",")[0]?.trim() || address.trim();

  return {
    address: address.trim(),
    streetAddress,
    price: `$${priceRaw}`,
    beds: `${bedsRaw} bd`,
    baths: `${bathsRaw} ba`,
    size: `${sizeRaw} sq ft`,
    middleSchool: extractSchool(text, "middle"),
    highSchool: extractSchool(text, "high"),
    schedule,
    image: extractMetaImage(html),
    url,
  };
}

async function fetchZipOpenHouses(zip: string, limit = 2) {
  const cached = cache.get(zip);
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached.items;
  }

  const searchHtml = await fetchHtml(`https://www.redfin.com/zipcode/${zip}/open-houses`);
  const listingUrls = extractUniqueListingUrls(searchHtml, limit * 6);

  const listings = (
    await Promise.all(
      listingUrls.map(async (url) => {
        try {
          const html = await fetchHtml(url);
          return parseListingPage(url, html);
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean) as OpenHouseListing[];

  const trimmed = listings.slice(0, limit);
  cache.set(zip, { updatedAt: Date.now(), items: trimmed });
  return trimmed;
}

export async function handleHousingOpenHouses(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const zipsParam = typeof req.query.zips === "string" ? req.query.zips : DEFAULT_ZIPS.join(",");
  const zips = zipsParam
    .split(",")
    .map((zip) => zip.trim())
    .filter((zip) => /^\d{5}$/.test(zip))
    .slice(0, 8);

  try {
    const entries = await Promise.all(
      zips.map(async (zip) => [zip, await fetchZipOpenHouses(zip)] as const),
    );

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      byZip: Object.fromEntries(entries),
    });
  } catch (error: any) {
    console.error("[housing-open-houses] error", error);
    return res.status(500).json({ error: "fetch failed", message: error?.message });
  }
}

export default handleHousingOpenHouses;
