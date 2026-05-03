import type { VercelRequest, VercelResponse } from "@vercel/node";
import { XMLParser } from "fast-xml-parser";
import { ttlMsToSeconds } from "../../shared/config.js";
import {
  getCachedData,
  getStaleCache,
  handleOptions,
  isCacheBypass,
  setCache,
  setCorsHeaders,
} from "../../lib/api-utils.js";

const JOB_MARKET_CACHE_TTL = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 10000;
const OPENINGS_SERIES_ID = "JTS540099JOR";
const OPENINGS_SERIES_URL = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${OPENINGS_SERIES_ID}`;
const OPENINGS_MONTHS = 8;

type SourceMode = "live" | "partial" | "cache" | "seed" | "unavailable";

interface AnalysisArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

interface OpeningsPoint {
  date: string;
  label: string;
  openingsRate: number;
}

interface SignalMetric {
  label: string;
  value: number;
  previous?: number;
  delta?: number;
  unit: string;
  tone: "positive" | "negative" | "neutral";
  trend: "up" | "down" | "flat";
  source: string;
  asOf?: string;
}

interface JobMarketPayload {
  marketState: "cool" | "neutral" | "improving";
  summary: {
    en: string;
    zh: string;
  };
  signals: {
    openings: SignalMetric;
    hiring: SignalMetric;
    layoffs: SignalMetric;
  };
  chart: OpeningsPoint[];
  articles: AnalysisArticle[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

const ANALYSIS_FALLBACK_ARTICLES: AnalysisArticle[] = [
  {
    title: "Indeed Hiring Lab tracks the broader hiring backdrop for software and AI-related jobs",
    url: "https://www.hiringlab.org/",
    source: "Indeed Hiring Lab",
  },
  {
    title: "FRED publishes the professional and business services job openings rate",
    url: `https://fred.stlouisfed.org/series/${OPENINGS_SERIES_ID}`,
    source: "FRED",
  },
];

function getLaDateKey(dateLike: string | number | Date) {
  return new Date(dateLike).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

function formatMonthLabel(dateLike: string) {
  return new Date(`${dateLike}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
  });
}

function formatOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeUrl(url: string) {
  return url.replace(/[#?].*$/, "").replace(/\/$/, "");
}

function decodeGoogleNewsUrl(url: string) {
  try {
    const parsed = new URL(url);
    const actual = parsed.searchParams.get("url");
    return actual ? actual : url;
  } catch {
    return url;
  }
}

function normalizeArticleSource(raw: string) {
  if (/hiring lab/i.test(raw)) return "Indeed Hiring Lab";
  if (/fred|st\. louis fed/i.test(raw)) return "FRED";
  if (/reuters/i.test(raw)) return "Reuters";
  if (/cnbc/i.test(raw)) return "CNBC";
  if (/wsj|wall street journal/i.test(raw)) return "WSJ";
  if (/techcrunch/i.test(raw)) return "TechCrunch";
  if (/fortune/i.test(raw)) return "Fortune";
  if (/business insider/i.test(raw)) return "Business Insider";
  if (/google/i.test(raw)) return "Google News";
  return raw || "News";
}

function cleanArticleTitle(title: string) {
  return title.replace(/\s*-\s*Google News$/i, "").trim();
}

function normalizeTitleKey(title: string) {
  return cleanArticleTitle(title)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(the|a|an|and|or|for|to|of|in|on|with|latest)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreAnalysisArticle(title: string, source: string) {
  let score = 0;
  const normalized = title.toLowerCase();
  if (/(job market|hiring trend|hiring outlook|labor market|job postings|job openings)/i.test(normalized)) score += 4;
  if (/(software engineer|software developer|developer|tech hiring|engineering hiring|ai jobs?)/i.test(normalized)) score += 3;
  if (/(layoff|layoffs|job cuts|headcount)/i.test(normalized)) score += 2;
  if (/(indeed hiring lab|fred|reuters|cnbc|wsj|wall street journal|fortune)/i.test(source)) score += 2;
  return score;
}

function classifyPulse(count: number, kind: "hiring" | "layoff") {
  const high = kind === "hiring" ? 10 : 8;
  const medium = kind === "hiring" ? 4 : 3;
  if (count >= high) {
    return {
      label: kind === "hiring" ? "Active coverage" : "Elevated pressure",
      tone: kind === "hiring" ? ("positive" as const) : ("negative" as const),
      trend: "up" as const,
    };
  }
  if (count >= medium) {
    return {
      label: kind === "hiring" ? "Mixed coverage" : "Moderate pressure",
      tone: "neutral" as const,
      trend: "flat" as const,
    };
  }
  return {
    label: kind === "hiring" ? "Thin coverage" : "Contained pressure",
    tone: kind === "hiring" ? ("neutral" as const) : ("positive" as const),
    trend: kind === "hiring" ? ("flat" as const) : ("down" as const),
  };
}

function buildArticleList(
  analysisArticles: AnalysisArticle[],
  hiringArticles: AnalysisArticle[],
  layoffArticles: AnalysisArticle[],
) {
  const articleMap = new Map<string, AnalysisArticle>();
  for (const article of [...analysisArticles, ...hiringArticles, ...layoffArticles]) {
    if (!article.title || !article.url) continue;
    const key = normalizeUrl(article.url) || normalizeTitleKey(article.title);
    const current = articleMap.get(key);
    if (
      !current ||
      scoreAnalysisArticle(article.title, article.source) >
        scoreAnalysisArticle(current.title, current.source)
    ) {
      articleMap.set(key, article);
    }
  }

  const articles = Array.from(articleMap.values())
    .sort((a, b) => {
      const scoreDiff =
        scoreAnalysisArticle(b.title, b.source) - scoreAnalysisArticle(a.title, a.source);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
    })
    .slice(0, 3);

  return articles.length > 0 ? articles : [...ANALYSIS_FALLBACK_ARTICLES];
}

async function fetchGoogleNewsItems(query: string) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const resp = await fetch(rssUrl, {
    headers: { "User-Agent": "BayAreaDashboard/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!resp.ok) {
    throw new Error(`Google News RSS ${resp.status}`);
  }

  const xml = await resp.text();
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items.map((item: any) => ({
    title: cleanArticleTitle(String(item?.title || "")),
    url: decodeGoogleNewsUrl(String(item?.link || "")),
    source: normalizeArticleSource(
      String(item?.source?.["#text"] || item?.source || "Google News").trim(),
    ),
    publishedAt: item?.pubDate ? new Date(item.pubDate).toISOString() : undefined,
  }));
}

async function fetchOpeningsSeries() {
  const resp = await fetch(OPENINGS_SERIES_URL, {
    headers: { "User-Agent": "BayAreaDashboard/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!resp.ok) {
    throw new Error(`FRED ${resp.status}`);
  }

  const csv = await resp.text();
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const points = lines
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(",");
      const numeric = Number(value);
      return Number.isFinite(numeric) ? { date, openingsRate: numeric } : null;
    })
    .filter((item): item is { date: string; openingsRate: number } => !!item)
    .slice(-OPENINGS_MONTHS)
    .map((item) => ({
      ...item,
      label: formatMonthLabel(item.date),
    }));

  return points;
}

async function buildJobMarketPayload(): Promise<{ payload: JobMarketPayload; sourceMode: SourceMode }> {
  const [openingsResult, hiringResult, layoffsResult, analysisResult] = await Promise.allSettled([
    fetchOpeningsSeries(),
    fetchGoogleNewsItems(
      "(software engineer hiring OR software developer hiring OR engineering hiring OR tech hiring OR AI jobs) when:30d",
    ),
    fetchGoogleNewsItems(
      "(tech layoffs OR software engineer layoffs OR engineering layoffs OR developer layoffs) when:30d",
    ),
    fetchGoogleNewsItems(
      "(software engineer job market OR tech hiring outlook OR developer hiring trend OR job postings software development OR hiring lab software development) when:30d",
    ),
  ]);

  const openings =
    openingsResult.status === "fulfilled" && openingsResult.value.length > 1
      ? openingsResult.value
      : [];
  const hiringArticles = hiringResult.status === "fulfilled" ? hiringResult.value : [];
  const layoffArticles = layoffsResult.status === "fulfilled" ? layoffsResult.value : [];
  const analysisArticles = analysisResult.status === "fulfilled" ? analysisResult.value : [];
  const hasLiveNews =
    hiringResult.status === "fulfilled" ||
    layoffsResult.status === "fulfilled" ||
    analysisResult.status === "fulfilled";

  if (openings.length === 0) {
    return {
      payload: {
        marketState: "neutral",
        summary: {
          en: "FRED openings data is temporarily unavailable. Live hiring and layoff coverage below is still current.",
          zh: "FRED 职位空缺数据暂时不可用，但下面的招聘和裁员新闻信号仍然是实时的。",
        },
        signals: {
          openings: {
            label: "No fresh FRED read",
            value: 0,
            unit: "%",
            tone: "neutral",
            trend: "flat",
            source: "FRED/BLS",
          },
          hiring: {
            label: "Thin coverage",
            value: hiringArticles.length,
            unit: "articles",
            tone: "neutral",
            trend: "flat",
            source: "Google News",
          },
          layoffs: {
            label: "Contained pressure",
            value: layoffArticles.length,
            unit: "articles",
            tone: "positive",
            trend: "down",
            source: "Google News",
          },
        },
        chart: [],
        articles: buildArticleList(analysisArticles, hiringArticles, layoffArticles),
      },
      sourceMode: hasLiveNews ? "partial" : "seed",
    };
  }

  const latestOpenings = openings[openings.length - 1];
  const previousOpenings = openings[openings.length - 2];
  const openingsDelta = formatOneDecimal(latestOpenings.openingsRate - previousOpenings.openingsRate);
  const hiring7d = hiringArticles.filter((item) => {
    if (!item.publishedAt) return false;
    return Date.now() - new Date(item.publishedAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const layoffs7d = layoffArticles.filter((item) => {
    if (!item.publishedAt) return false;
    return Date.now() - new Date(item.publishedAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const hiringPulse = classifyPulse(hiringArticles.length, "hiring");
  const layoffPressure = classifyPulse(layoffArticles.length, "layoff");

  let score = 0;
  if (openingsDelta >= 0.3) score += 2;
  else if (openingsDelta >= 0.1) score += 1;
  else if (openingsDelta <= -0.5) score -= 2;
  else if (openingsDelta <= -0.2) score -= 1;

  if (hiringArticles.length >= 8) score += 1;
  else if (hiringArticles.length <= 2) score -= 1;

  if (layoffArticles.length >= 8) score -= 1;
  else if (layoffArticles.length <= 2) score += 1;

  const marketState =
    score >= 2 ? "improving" : score <= -2 ? "cool" : "neutral";

  const summary =
    marketState === "improving"
      ? {
          en: `Hiring commentary is improving. FRED openings rose to ${latestOpenings.openingsRate}% and recent hiring coverage is outpacing layoff coverage.`,
          zh: `市场有回暖迹象。FRED 职位空缺率回到 ${latestOpenings.openingsRate}% ，最近的招聘分析声量也高于裁员声量。`,
        }
      : marketState === "cool"
        ? {
            en: `The market still looks cool. Openings slipped to ${latestOpenings.openingsRate}% and layoff coverage remains heavier than hiring coverage.`,
            zh: `市场仍偏冷。职位空缺率降到 ${latestOpenings.openingsRate}% ，而且裁员相关新闻仍明显多于招聘信号。`,
          }
        : {
            en: `The market is mixed. Openings are at ${latestOpenings.openingsRate}% and external commentary still points to selective hiring rather than a broad rebound.`,
            zh: `市场偏中性。职位空缺率当前在 ${latestOpenings.openingsRate}% 左右，外部分析更像是“选择性招聘”，还不是全面回暖。`,
          };

  const articleMap = new Map<string, AnalysisArticle>();
  for (const article of [...analysisArticles, ...hiringArticles, ...layoffArticles]) {
    if (!article.title || !article.url) continue;
    const key = normalizeUrl(article.url) || normalizeTitleKey(article.title);
    const current = articleMap.get(key);
    if (!current || scoreAnalysisArticle(article.title, article.source) > scoreAnalysisArticle(current.title, current.source)) {
      articleMap.set(key, article);
    }
  }

  const articles = Array.from(articleMap.values())
    .sort((a, b) => {
      const scoreDiff = scoreAnalysisArticle(b.title, b.source) - scoreAnalysisArticle(a.title, a.source);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
    })
    .slice(0, 3);

  if (articles.length === 0) {
    articles.push(...ANALYSIS_FALLBACK_ARTICLES);
  }

  return {
    payload: {
      marketState,
      summary,
      signals: {
        openings: {
          label: "Professional & business services openings",
          value: latestOpenings.openingsRate,
          previous: previousOpenings.openingsRate,
          delta: openingsDelta,
          unit: "%",
          tone:
            openingsDelta > 0.05 ? "positive" : openingsDelta < -0.05 ? "negative" : "neutral",
          trend:
            openingsDelta > 0.05 ? "up" : openingsDelta < -0.05 ? "down" : "flat",
          source: `FRED/BLS ${OPENINGS_SERIES_ID}`,
          asOf: latestOpenings.date,
        },
        hiring: {
          label: hiringPulse.label,
          value: hiringArticles.length,
          previous: hiring7d,
          unit: "articles / 30d",
          tone: hiringPulse.tone,
          trend: hiringPulse.trend,
          source: "Google News hiring coverage",
          asOf: getLaDateKey(new Date()),
        },
        layoffs: {
          label: layoffPressure.label,
          value: layoffArticles.length,
          previous: layoffs7d,
          unit: "articles / 30d",
          tone: layoffPressure.tone,
          trend: layoffPressure.trend,
          source: "Google News layoff coverage",
          asOf: getLaDateKey(new Date()),
        },
      },
      chart: openings,
      articles,
    },
    sourceMode:
      hiringResult.status === "fulfilled" || layoffsResult.status === "fulfilled" || analysisResult.status === "fulfilled"
        ? "live"
        : "partial",
  };
}

export async function fetchJobMarketTrendData(nocache = false) {
  const cacheKey = "job-market-analysis:v1";

  if (!nocache) {
    const cached = getCachedData(cacheKey, JOB_MARKET_CACHE_TTL, false);
    if (cached?.data) {
      return { ...cached.data, sourceMode: cached.data.sourceMode || "cache" };
    }
  }

  const { payload, sourceMode } = await buildJobMarketPayload();
  const response = {
    status: payload.chart.length > 0 ? "ok" : "partial",
    ...payload,
    fetchedAt: new Date().toISOString(),
    ttlSeconds: ttlMsToSeconds(JOB_MARKET_CACHE_TTL),
    sourceMode,
  };

  if (payload.chart.length > 0 || payload.articles.length > 0) {
    setCache(cacheKey, response);
  }

  return response;
}

export async function handleJobMarketTrend(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (handleOptions(req, res)) return;

  try {
    const nocache = isCacheBypass(req);
    const data = await fetchJobMarketTrendData(nocache);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json(data);
  } catch (error) {
    console.error("[API /api/job-market-trend] Error:", error);

    const stale = getStaleCache("job-market-analysis:v1");
    if (stale?.data) {
      res.status(200).json({
        ...stale.data,
        status: "stale",
        sourceMode: "cache",
      });
      return;
    }

    res.status(200).json({
      status: "unavailable",
      marketState: "neutral",
      summary: {
        en: "External market sources are temporarily unavailable.",
        zh: "外部市场数据源暂时不可用。",
      },
      signals: {
        openings: {
          label: "No fresh FRED read",
          value: 0,
          unit: "%",
          tone: "neutral",
          trend: "flat",
          source: "FRED/BLS",
        },
        hiring: {
          label: "Thin coverage",
          value: 0,
          unit: "articles / 30d",
          tone: "neutral",
          trend: "flat",
          source: "Google News hiring coverage",
        },
        layoffs: {
          label: "Contained pressure",
          value: 0,
          unit: "articles / 30d",
          tone: "neutral",
          trend: "flat",
          source: "Google News layoff coverage",
        },
      },
      chart: [],
      articles: ANALYSIS_FALLBACK_ARTICLES,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      sourceMode: "unavailable",
    });
  }
}

export default handleJobMarketTrend;
