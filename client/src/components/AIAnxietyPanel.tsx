import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, ChevronDown, ChevronUp, Radar, ShieldAlert, Target } from "lucide-react";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  buildJobMarketPayload,
  countAIHits,
  getJobMarketFallbackPayload,
  type JobMarketPayload,
  type JobMarketVerdict,
} from "@/lib/aiAnxiety";

interface JobItem {
  title: string;
  category?: "layoff" | "hiring" | "discussion";
}

interface OfferItem {
  title: string;
}

interface MarketNewsItem {
  title?: string;
  title_zh?: string;
  title_en?: string;
}

interface AIAnxietyPanelProps {
  jobs?: JobItem[];
  offers?: OfferItem[];
  news?: MarketNewsItem[];
  variant?: "compact" | "full" | "home-summary";
}

const verdictConfig: Record<
  JobMarketVerdict,
  {
    badge: string;
    badgeEn: string;
    tone: string;
    panelTone: string;
  }
> = {
  defensive: {
    badge: "偏防守",
    badgeEn: "Defensive",
    tone: "border-rose-400/25 bg-rose-500/10 text-rose-200",
    panelTone: "border-rose-400/18 bg-rose-500/[0.07]",
  },
  mixed: {
    badge: "观察推进",
    badgeEn: "Mixed",
    tone: "border-amber-400/25 bg-amber-500/10 text-amber-200",
    panelTone: "border-amber-400/18 bg-amber-500/[0.07]",
  },
  active: {
    badge: "偏进攻",
    badgeEn: "Active",
    tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    panelTone: "border-emerald-400/18 bg-emerald-500/[0.07]",
  },
};

const evidenceToneClasses = {
  negative: "border-rose-400/18 bg-rose-500/[0.07]",
  neutral: "border-white/10 bg-white/[0.04]",
  positive: "border-emerald-400/18 bg-emerald-500/[0.07]",
} as const;

export default function AIAnxietyPanel({
  jobs,
  offers,
  news,
  variant = "full",
}: AIAnxietyPanelProps) {
  const { lang } = useLanguage();
  const [payload, setPayload] = useState<JobMarketPayload>(getJobMarketFallbackPayload(lang));
  const hasPreloadedFeeds = !!jobs && !!offers && !!news;
  const [loading, setLoading] = useState(!hasPreloadedFeeds);
  const [isFallback, setIsFallback] = useState(!hasPreloadedFeeds);
  const [explanationOpen, setExplanationOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        let nextJobs = jobs ?? [];
        let nextOffers = offers ?? [];
        let nextNews = news ?? [];

        if (!hasPreloadedFeeds) {
          const [jobsResp, offersResp, newsResp] = await Promise.allSettled([
            fetch(`${config.apiBaseUrl}/api/community/jobs`, { signal: AbortSignal.timeout(10000) }),
            fetch(`${config.apiBaseUrl}/api/community/offers`, { signal: AbortSignal.timeout(10000) }),
            fetch(`${config.apiBaseUrl}/api/market-news`, { signal: AbortSignal.timeout(10000) }),
          ]);

          nextJobs =
            jobsResp.status === "fulfilled" && jobsResp.value.ok
              ? ((await jobsResp.value.json()).items ?? [])
              : [];
          nextOffers =
            offersResp.status === "fulfilled" && offersResp.value.ok
              ? ((await offersResp.value.json()).items ?? [])
              : [];
          nextNews =
            newsResp.status === "fulfilled" && newsResp.value.ok
              ? ((await newsResp.value.json()).items ?? [])
              : [];
        }

        const layoffCount = nextJobs.filter((item) => item.category === "layoff").length;
        const offerCount = nextOffers.length;
        const aiDiscussionCount = countAIHits([
          ...nextJobs.map((item) => item.title),
          ...nextOffers.map((item) => item.title),
        ]);
        const aiNewsCount = countAIHits(
          nextNews.map((item) => item.title_zh || item.title || item.title_en || "").filter(Boolean),
        );

        const nextPayload = buildJobMarketPayload(
          { layoffCount, offerCount, aiNewsCount, aiDiscussionCount },
          lang,
          new Date().toISOString(),
        );

        if (!active) return;
        setPayload(nextPayload);
        setIsFallback(false);
      } catch (error) {
        console.error("[AIAnxietyPanel] Failed to build job market payload:", error);
        if (!active) return;
        setPayload(getJobMarketFallbackPayload(lang));
        setIsFallback(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    if (hasPreloadedFeeds) {
      return () => {
        active = false;
      };
    }

    const interval = setInterval(load, 30 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasPreloadedFeeds, jobs, offers, news, lang]);

  const displayPayload = useMemo(() => payload, [payload]);
  const verdictMeta = verdictConfig[displayPayload.verdict];
  const badgeText = lang === "en" ? verdictMeta.badgeEn : verdictMeta.badge;
  const primaryAction = displayPayload.actions[0];

  if (variant === "home-summary") {
    return (
      <section className={`rounded-[1rem] border ${verdictMeta.panelTone}`}>
        <button
          type="button"
          onClick={() => setExplanationOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="min-w-0">
            <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/68">
              {lang === "en" ? "Job Call" : "求职判断"}
            </div>
            <div className="truncate text-sm text-foreground/88">
              {loading
                ? lang === "en"
                  ? "Reading the market..."
                  : "正在判断今天该怎么推进..."
                : `${badgeText}，${primaryAction.title}`}
            </div>
          </div>
          {explanationOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          )}
        </button>

        {explanationOpen ? (
          <div className="border-t border-white/10 px-4 py-3">
            <div className="text-sm leading-6 text-foreground/82">{displayPayload.summary}</div>
            <div className="mt-2 text-sm leading-6 text-muted-foreground/78">
              {primaryAction.reason}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section className={`rounded-[1.1rem] border p-4 ${verdictMeta.panelTone}`}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-foreground/70">
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                  {lang === "en" ? "Job Market Desk" : "求职判断台"}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${verdictMeta.tone}`}
                >
                  {badgeText}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold leading-tight text-foreground">
                {loading
                  ? lang === "en"
                    ? "Reading the market..."
                    : "正在判断今天该怎么推进..."
                  : displayPayload.headline}
              </h3>
              <p className="mt-2 text-sm leading-6 text-foreground/78">{displayPayload.summary}</p>
            </div>
            <Radar className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/68" />
          </div>

          <div className="rounded-[1rem] border border-white/10 bg-black/10 p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/75">
              {lang === "en" ? "Do This Next" : "下一步动作"}
            </div>
            <div className="mt-2 text-sm font-semibold text-foreground">{primaryAction.title}</div>
            <p className="mt-2 text-sm leading-6 text-foreground/74">{primaryAction.reason}</p>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
              <span>{primaryAction.effort}</span>
              <span>{displayPayload.evidence[0]?.note}</span>
            </div>
          </div>

          {isFallback && displayPayload.dataQualityNote ? (
            <div className="text-xs leading-6 text-muted-foreground/72">{displayPayload.dataQualityNote}</div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell rounded-[1.15rem] p-5">
      <div className="flex flex-col gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-foreground/70">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                {lang === "en" ? "Job Market Desk" : "求职判断台"}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] ${verdictMeta.tone}`}
              >
                {badgeText}
              </span>
              {isFallback ? (
                <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/65">
                  {lang === "en" ? "Fallback" : "保底输出"}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold leading-tight text-foreground">
              {loading
                ? lang === "en"
                  ? "Reading the market..."
                  : "正在判断今天该怎么推进..."
                : displayPayload.headline}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/74">
              {displayPayload.summary}
            </p>
            {displayPayload.dataQualityNote ? (
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground/78">
                {displayPayload.dataQualityNote}
              </p>
            ) : null}
          </div>

          <div className={`min-w-0 rounded-[1rem] border p-4 lg:w-[320px] ${verdictMeta.panelTone}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/65">
                  {lang === "en" ? "Primary Action" : "优先动作"}
                </div>
                <div className="mt-2 text-base font-semibold leading-6 text-foreground">
                  {primaryAction.title}
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/76">{primaryAction.reason}</p>
              </div>
              <ShieldAlert className="mt-1 h-5 w-5 text-muted-foreground/70" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/72">
              <span>{primaryAction.effort}</span>
              <span>{lang === "en" ? "Priority 1" : "优先级 1"}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {displayPayload.evidence.map((item) => (
            <div
              key={item.id}
              className={`rounded-[1rem] border p-4 ${evidenceToneClasses[item.tone]}`}
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
                {item.label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{item.valueText}</div>
              <p className="mt-3 text-sm leading-7 text-foreground/86">{item.note}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[1rem] border border-white/10 bg-white/[0.035]">
          <button
            type="button"
            onClick={() => setExplanationOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/65">
                {lang === "en" ? "Why This Call" : "判断依据"}
              </div>
              <div className="mt-1 break-words text-sm text-foreground/82">
                {lang === "en"
                  ? "Show the rule behind today's job-market verdict"
                  : "展开查看今天这个求职判断背后的规则"}
              </div>
            </div>
            {explanationOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            )}
          </button>

          {explanationOpen ? (
            <div className="border-t border-white/10 px-4 py-4 text-sm leading-7 text-foreground/78">
              {displayPayload.rationale.map((item, index) => (
                <p key={index} className={index === 0 ? "" : "mt-3"}>
                  {item}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[1rem] border border-emerald-400/18 bg-emerald-500/[0.08] p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-200/75">
            <Target className="h-3.5 w-3.5" />
            {lang === "en" ? "Action List" : "动作清单"}
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {displayPayload.actions.map((action) => (
              <div
                key={action.id}
                className="rounded-[1rem] border border-white/10 bg-black/10 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-100/78">
                    {lang === "en" ? `Priority ${action.priority}` : `优先级 ${action.priority}`}
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-foreground/74">
                    {action.effort}
                  </span>
                </div>
                <div className="mt-2 text-base font-medium text-foreground">{action.title}</div>
                <p className="mt-2 text-sm leading-7 text-foreground/76">{action.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
