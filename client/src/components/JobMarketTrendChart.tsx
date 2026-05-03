import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";

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

interface AnalysisArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

interface TrendPoint {
  date: string;
  label: string;
  openingsRate: number;
}

interface JobMarketResponse {
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
  chart: TrendPoint[];
  articles: AnalysisArticle[];
}

const FALLBACK_RESPONSE: JobMarketResponse = {
  marketState: "neutral",
  summary: {
    en: "External market analysis is temporarily unavailable.",
    zh: "外部市场分析暂时不可用。",
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
  articles: [],
};

function normalizeJobMarketResponse(input: unknown): JobMarketResponse {
  if (!input || typeof input !== "object") return FALLBACK_RESPONSE;
  const candidate = input as Partial<JobMarketResponse>;
  return {
    marketState:
      candidate.marketState === "cool" ||
      candidate.marketState === "neutral" ||
      candidate.marketState === "improving"
        ? candidate.marketState
        : FALLBACK_RESPONSE.marketState,
    summary: {
      en: candidate.summary?.en || FALLBACK_RESPONSE.summary.en,
      zh: candidate.summary?.zh || FALLBACK_RESPONSE.summary.zh,
    },
    signals: {
      openings: candidate.signals?.openings || FALLBACK_RESPONSE.signals.openings,
      hiring: candidate.signals?.hiring || FALLBACK_RESPONSE.signals.hiring,
      layoffs: candidate.signals?.layoffs || FALLBACK_RESPONSE.signals.layoffs,
    },
    chart: Array.isArray(candidate.chart) ? candidate.chart : FALLBACK_RESPONSE.chart,
    articles: Array.isArray(candidate.articles) ? candidate.articles : FALLBACK_RESPONSE.articles,
  };
}

function toneClass(tone: SignalMetric["tone"]) {
  if (tone === "positive") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (tone === "negative") return "border-rose-400/20 bg-rose-500/10 text-rose-300";
  return "border-white/10 bg-white/[0.04] text-muted-foreground";
}

function stateToneClass(state: JobMarketResponse["marketState"]) {
  if (state === "improving") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (state === "cool") return "border-rose-400/20 bg-rose-500/10 text-rose-300";
  return "border-amber-400/20 bg-amber-500/10 text-amber-200";
}

function formatValue(metric: SignalMetric) {
  if (metric.unit === "%") return `${metric.value.toFixed(1)}%`;
  return `${metric.value} ${metric.unit}`;
}

function formatDelta(metric: SignalMetric) {
  if (typeof metric.delta !== "number") return null;
  if (metric.unit === "%") {
    const sign = metric.delta > 0 ? "+" : "";
    return `${sign}${metric.delta.toFixed(1)} pt`;
  }
  if (!metric.previous) return null;
  return `${metric.previous} last 7d`;
}

function SignalRow({ metric }: { metric: SignalMetric }) {
  const deltaText = formatDelta(metric);
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground/75">
          {metric.label}
        </div>
        <div className="mt-1 text-sm text-muted-foreground/90">{metric.source}</div>
        {metric.asOf ? (
          <div className="mt-1 text-[11px] text-muted-foreground/65">{metric.asOf}</div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-base font-semibold text-foreground">{formatValue(metric)}</div>
        {deltaText ? <div className="mt-1 text-[11px] text-muted-foreground/70">{deltaText}</div> : null}
        <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] ${toneClass(metric.tone)}`}>
          {metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→"}
        </div>
      </div>
    </div>
  );
}

export default function JobMarketTrendChart() {
  const { lang } = useLanguage();
  const [data, setData] = useState<JobMarketResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`${config.apiBaseUrl}/api/market?handler=job-market-trend`, {
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) throw new Error(`job market analysis ${resp.status}`);
        const nextData = normalizeJobMarketResponse(await resp.json());
        setData(nextData);
      } catch (error) {
        console.error("[JobMarketTrendChart] Failed to fetch analysis:", error);
        setData(FALLBACK_RESPONSE);
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(() => data?.chart || [], [data]);
  const stateLabel =
    data?.marketState === "improving"
      ? lang === "en"
        ? "Improving"
        : "回暖"
      : data?.marketState === "cool"
        ? lang === "en"
          ? "Cool"
          : "偏冷"
        : lang === "en"
          ? "Mixed"
          : "中性";

  return (
    <section className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">
            {lang === "en" ? "Engineer Job Market" : "码农 Job Market"}
          </h2>
          <div className="mt-1 text-sm text-muted-foreground">
            {lang === "en"
              ? "Based on public labor-market data and current hiring analysis, not forum post counts."
              : "基于公开劳动力市场数据和外部招聘分析，不再根据论坛帖子数硬推断。"}
          </div>
        </div>
        {data ? (
          <div className={`inline-flex rounded-full border px-3 py-1.5 text-sm ${stateToneClass(data.marketState)}`}>
            {stateLabel}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.03] px-4 py-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-sm bg-muted/30" />
        ) : (
          <div className="text-sm leading-7 text-foreground/90">
            {data ? (lang === "en" ? data.summary.en : data.summary.zh) : lang === "en"
              ? "External market analysis is temporarily unavailable."
              : "外部市场分析暂时不可用。"}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {data ? (
          <>
            <SignalRow metric={data.signals.openings} />
            <SignalRow metric={data.signals.hiring} />
            <SignalRow metric={data.signals.layoffs} />
          </>
        ) : (
          [1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-[1rem] bg-muted/25" />
          ))
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 rounded-[1rem] border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground/75">
            {lang === "en" ? "FRED Openings Rate" : "FRED 职位空缺率"}
          </div>
          <div className="h-[220px] w-full min-w-0">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {lang === "en" ? "No chart yet." : "暂无可用走势图。"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "rgba(226,232,240,0.55)", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    tick={{ fill: "rgba(226,232,240,0.45)", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(1)}%`}
                    labelFormatter={(value) => value}
                    contentStyle={{
                      background: "rgba(15,23,42,0.95)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="openingsRate"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={{ r: 2, fill: "#38bdf8" }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-[1rem] border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-3 text-xs uppercase tracking-[0.16em] text-muted-foreground/75">
            {lang === "en" ? "Recent Market Reads" : "近期市场分析"}
          </div>
          <div className="space-y-3">
            {(data?.articles || []).map((article, idx) => (
              <a
                key={`${article.url}-${idx}`}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[0.9rem] border border-white/10 bg-background/35 px-3 py-3 transition-colors hover:border-primary/35 hover:bg-background/55"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/65">
                  <span>{article.source}</span>
                  {article.publishedAt ? <span>{new Date(article.publishedAt).toLocaleDateString("en-US")}</span> : null}
                </div>
                <div className="mt-2 line-clamp-3 text-sm leading-6 text-foreground/90">{article.title}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
