import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/Navigation";
import TimeAgo from "@/components/TimeAgo";
import ChineseGossip from "@/components/ChineseGossip";
import LeekCommunity from "@/components/LeekCommunity";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";
import { generateJobMarketJudgment } from "@/lib/judgment";

interface JobItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
}

interface GossipItem {
  title: string;
  url: string;
}

interface JobsResponse {
  status: "ok" | "unavailable";
  items: JobItem[];
  fetchedAt?: string;
  sourceMode?: "live" | "cache" | "unavailable";
}

interface GossipResponse {
  status: "ok";
  sources?: {
    "1point3acres"?: {
      items?: GossipItem[];
      status?: "ok" | "degraded" | "failed";
      source?: "live" | "cache" | "seed" | "unavailable";
      fetchedAt?: string;
    };
    weibo?: {
      items?: GossipItem[];
      status?: "ok" | "degraded" | "failed";
      source?: "live" | "cache" | "seed" | "unavailable";
      fetchedAt?: string;
    };
  };
  fetchedAt?: string;
}

interface LeeksResponse {
  items?: GossipItem[];
  sources?: {
    "1point3acres"?: {
      status?: "ok" | "unavailable";
      asOf?: string;
    };
  };
  asOf?: string;
  stale?: boolean;
  cache_hit?: boolean;
}

interface MarketResponse {
  data?: {
    spy?: {
      change_percent?: number;
    };
  };
}

function BackToHomeLink() {
  const { lang } = useLanguage();
  const t = useT(lang);

  return (
    <Link href="/">
      <span className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border/45 bg-card/55 px-3 py-2 text-sm font-medium text-foreground/82 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card/80 hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        <span>{t.common.backHome}</span>
      </span>
    </Link>
  );
}

function countMatches(items: JobItem[], patterns: RegExp[]) {
  return items.filter((item) => patterns.some((pattern) => pattern.test(item.title))).length;
}

export default function Baoguo() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { handleExternalLinkClick } = useExternalLink();

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [jobsStatus, setJobsStatus] = useState<JobsResponse["status"]>("unavailable");
  const [sourceMode, setSourceMode] = useState<JobsResponse["sourceMode"]>("unavailable");
  const [discussionCount, setDiscussionCount] = useState(0);
  const [spyChangePercent, setSpyChangePercent] = useState(0);
  const [jobsFetchedAt, setJobsFetchedAt] = useState<string | undefined>(undefined);
  const [gossipFetchedAt, setGossipFetchedAt] = useState<string | undefined>(undefined);
  const [gossipStatus, setGossipStatus] = useState<"ok" | "degraded" | "failed">("failed");
  const [gossipSource, setGossipSource] = useState<"live" | "cache" | "seed" | "unavailable">(
    "unavailable",
  );
  const [leeksFetchedAt, setLeeksFetchedAt] = useState<string | undefined>(undefined);
  const [leeksStatus, setLeeksStatus] = useState<"ok" | "unavailable">("unavailable");
  const [leeksCacheHit, setLeeksCacheHit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      try {
        const [jobsResp, gossipResp, leeksResp, marketResp] = await Promise.allSettled([
          fetch(`${config.apiBaseUrl}/api/community/jobs`, {
            signal: AbortSignal.timeout(10000),
          }),
          fetch(`${config.apiBaseUrl}/api/community/gossip`, {
            signal: AbortSignal.timeout(10000),
          }),
          fetch(`${config.apiBaseUrl}/api/community/leeks`, {
            signal: AbortSignal.timeout(10000),
          }),
          fetch(`${config.apiBaseUrl}/api/market`, {
            signal: AbortSignal.timeout(10000),
          }),
        ]);

        if (jobsResp.status === "fulfilled" && jobsResp.value.ok) {
          const data: JobsResponse = await jobsResp.value.json();
          setJobs(data.items || []);
          setJobsStatus(data.status);
          setSourceMode(data.sourceMode || "unavailable");
          setJobsFetchedAt(data.fetchedAt);
        }

        let totalDiscussionCount = 0;

        if (gossipResp.status === "fulfilled" && gossipResp.value.ok) {
          const data: GossipResponse = await gossipResp.value.json();
          totalDiscussionCount += data.sources?.["1point3acres"]?.items?.length || 0;
          totalDiscussionCount += data.sources?.weibo?.items?.length || 0;
          setGossipFetchedAt(
            data.sources?.["1point3acres"]?.fetchedAt ||
              data.sources?.weibo?.fetchedAt ||
              data.fetchedAt,
          );
          const statuses = [
            data.sources?.["1point3acres"]?.status,
            data.sources?.weibo?.status,
          ].filter(Boolean);
          if (statuses.includes("failed")) {
            setGossipStatus("failed");
          } else if (statuses.includes("degraded")) {
            setGossipStatus("degraded");
          } else {
            setGossipStatus("ok");
          }
          setGossipSource(
            data.sources?.["1point3acres"]?.source ||
              data.sources?.weibo?.source ||
              "unavailable",
          );
        }

        if (leeksResp.status === "fulfilled" && leeksResp.value.ok) {
          const data: LeeksResponse = await leeksResp.value.json();
          totalDiscussionCount += data.items?.length || 0;
          setLeeksFetchedAt(data.sources?.["1point3acres"]?.asOf || data.asOf);
          setLeeksStatus(data.sources?.["1point3acres"]?.status || "unavailable");
          setLeeksCacheHit(Boolean(data.cache_hit));
        }

        setDiscussionCount(totalDiscussionCount);

        if (marketResp.status === "fulfilled" && marketResp.value.ok) {
          const data: MarketResponse = await marketResp.value.json();
          setSpyChangePercent(Number(data.data?.spy?.change_percent || 0));
        }
      } catch (error) {
        console.error("[Baoguo] Failed to fetch work data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
    const interval = setInterval(loadAll, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const layoffCount = useMemo(
    () =>
      countMatches(jobs, [
        /layoff/i,
        /laid off/i,
        /job cut/i,
        /downsiz/i,
        /restructur/i,
        /裁员/,
      ]),
    [jobs],
  );

  const hiringCount = useMemo(
    () =>
      countMatches(jobs, [
        /hiring/i,
        /recruit/i,
        /interview/i,
        /offer/i,
        /job opening/i,
        /招聘/,
        /面试/,
      ]),
    [jobs],
  );

  const techStockTrend = spyChangePercent > 0.5 ? "up" : spyChangePercent < -0.5 ? "down" : "flat";

  const judgment = useMemo(
    () =>
      generateJobMarketJudgment({
        layoffCount,
        hiringCount,
        techStockTrend,
        spyChangePercent,
      }),
    [hiringCount, layoffCount, spyChangePercent, techStockTrend],
  );

  const pulse = useMemo(() => {
    if (loading) return "正在拉取最近一轮找工讨论和裁员帖。";
    return judgment.message;
  }, [judgment.message, loading]);

  const discussionLabel = useMemo(() => {
    if (discussionCount >= 20) return "讨论密度高";
    if (discussionCount >= 10) return "讨论密度中等";
    return "讨论密度偏低";
  }, [discussionCount]);

  const temperatureTone =
    judgment.temperature === "hot"
      ? "text-emerald-300/90"
      : judgment.temperature === "cold"
        ? "text-rose-300/90"
        : "text-amber-300/90";

  const sourceConfidence = useMemo(() => {
    const score =
      (sourceMode === "live" ? 35 : sourceMode === "cache" ? 24 : 8) +
      (gossipStatus === "ok" ? 35 : gossipStatus === "degraded" ? 20 : 8) +
      (leeksStatus === "ok" ? 30 : 10);

    if (score >= 85) return { label: "高", detail: "三路信号都比较完整。", tone: "text-emerald-300/90" };
    if (score >= 60) return { label: "中", detail: "主信号可用，但有部分缓存或降级。", tone: "text-amber-300/90" };
    return { label: "低", detail: "判断更多依赖残缺源，适合轻参考。", tone: "text-rose-300/90" };
  }, [gossipStatus, leeksStatus, sourceMode]);

  const formatMode = (mode?: string) => {
    if (mode === "live") return "实时";
    if (mode === "cache") return "缓存";
    if (mode === "seed") return "降级";
    return "不可用";
  };

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-sm p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <BackToHomeLink />
              <div className="grid gap-4 md:grid-cols-[1.25fr_0.8fr] md:items-end">
                <div className="min-w-0">
                  <div className="eyebrow mb-3">Work Briefing</div>
                  <h1 className="text-2xl font-semibold leading-tight text-foreground md:text-[34px] md:leading-[1.08]">
                    {t.baoguo.title}
                  </h1>
                  <div className="mt-2 text-sm font-medium text-primary/90 md:text-base">
                    {t.baoguo.subtitle}
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    把裁员帖、找工讨论和社区情绪合成可解释的判断层，减少被单条热帖带偏的概率。
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className={`text-[11px] uppercase tracking-[0.16em] ${temperatureTone}`}>
                      Temperature
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">{pulse}</div>
                  </div>
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                      Risk
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      {judgment.riskWarning}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm p-4 md:p-5">
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">Work Temp</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {judgment.icon} {judgment.temperatureLabel}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  分数 {judgment.temperatureScore}
                </div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-rose-300/75">Layoffs</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{layoffCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">近期裁员/收缩信号</div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">Hiring</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{hiringCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">招聘/面试/offer 信号</div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">Discussion</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{discussionCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">{discussionLabel}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Hiring vs Layoff</div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {hiringCount > layoffCount
                    ? "招聘相关信号多于裁员，适合高意愿用户主动投递。"
                    : hiringCount < layoffCount
                      ? "裁员信号更多，建议保守评估节奏和风险。"
                      : "招聘和裁员信号接近，说明市场还在拉扯。"}
                </div>
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Market Backdrop</div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  SPY {spyChangePercent >= 0 ? "+" : ""}
                  {spyChangePercent.toFixed(2)}%，
                  {techStockTrend === "up"
                    ? "风险偏好在回升。"
                    : techStockTrend === "down"
                      ? "风险偏好在下降。"
                      : "大盘背景偏中性。"}
                </div>
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Source Mode</div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  jobs {sourceMode === "live" ? "实时" : sourceMode === "cache" ? "缓存" : "不可用"}，
                  {jobsStatus === "ok" ? "主信号正常。" : "主信号偏弱，谨慎参考。"}
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Source Confidence</div>
              <h2 className="text-xl font-semibold text-foreground">可信度与新鲜度</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                这不是隐藏在后台的健康状态，而是这轮判断你到底该信几分的公开说明。
              </p>
            </div>
            <div className="p-5">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="hero-pulse-card rounded-sm p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">Confidence</div>
                  <div className={`mt-2 text-2xl font-semibold ${sourceConfidence.tone}`}>
                    {sourceConfidence.label}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{sourceConfidence.detail}</div>
                </div>
                <div className="hero-pulse-card rounded-sm p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">Jobs</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">
                    {formatMode(sourceMode)} · {jobsStatus === "ok" ? "正常" : "偏弱"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {jobsFetchedAt ? <TimeAgo isoString={jobsFetchedAt} /> : "无时间戳"}
                  </div>
                </div>
                <div className="hero-pulse-card rounded-sm p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">Community</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">
                    gossip {formatMode(gossipSource)} · {gossipStatus === "ok" ? "正常" : gossipStatus === "degraded" ? "降级" : "失败"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {gossipFetchedAt ? <TimeAgo isoString={gossipFetchedAt} /> : "无时间戳"}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Jobs Feed</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">
                    Reddit 工作帖是主判断源，适合抓短期温度，但不适合替代真实职位供给。
                  </div>
                </div>
                <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Gossip Feed</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">
                    八卦和论坛热聊用于测情绪扩散速度，不用于直接下结论。
                  </div>
                </div>
                <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Leeks Feed</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">
                    一亩三分地长帖更适合做深参考。
                    {leeksCacheHit ? " 当前返回里带缓存命中。" : ""}
                    {" "}
                    {leeksFetchedAt ? <TimeAgo isoString={leeksFetchedAt} /> : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Hiring Radar</div>
              <h2 className="text-xl font-semibold text-foreground">裁员与找工</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                先看最值得点开的工作帖，再结合上面的判断层决定今天的求职动作。
              </p>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="grid gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-sm bg-muted/40" />
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  暂时没有抓到足够的工作帖。
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((item, idx) => (
                    <a
                      key={`${item.url}-${idx}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleExternalLinkClick}
                      className="group flex items-start gap-3 rounded-sm border border-border/30 bg-card/45 p-4 transition-all hover:border-primary/35 hover:bg-card/65"
                    >
                      <span className="shrink-0 rounded-sm bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-rose-300">
                        {item.source}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm leading-6 text-foreground/90 transition-colors group-hover:text-primary">
                          {item.title}
                        </div>
                        {item.publishedAt ? (
                          <div className="mt-2 text-[11px] font-mono text-muted-foreground/65">
                            <TimeAgo isoString={item.publishedAt} />
                          </div>
                        ) : null}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="section-shell rounded-sm">
              <div className="border-b border-border/30 p-5">
                <div className="eyebrow mb-2">Community Pulse</div>
                <h2 className="text-xl font-semibold text-foreground">吃瓜风向</h2>
                <p className="mt-1 text-sm text-muted-foreground/72">
                  用微博/V2EX/论坛混合热度做情绪读数，不把单一来源当成市场结论。
                </p>
              </div>
              <div className="p-5">
                <ChineseGossip maxItemsPerSource={4} />
              </div>
            </section>

            <section className="section-shell rounded-sm">
              <div className="border-b border-border/30 p-5">
                <div className="eyebrow mb-2">Deep Threads</div>
                <h2 className="text-xl font-semibold text-foreground">一亩三分地</h2>
                <p className="mt-1 text-sm text-muted-foreground/72">
                  经验帖和长讨论更适合真正准备改简历、面试、谈 offer 的时候读。
                </p>
              </div>
              <div className="p-5">
                <LeekCommunity maxItems={6} hideTitle />
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-border py-6">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-xs font-mono text-muted-foreground/55 md:flex-row md:text-left">
            <div>
              <span className="text-sm font-semibold text-sky-300/85">{t.home.footerTagline}</span>
              <span className="ml-2">
                | {t.baoguo.title} - {t.baoguo.subtitle}
              </span>
            </div>
            <span>{t.home.footerSub}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
