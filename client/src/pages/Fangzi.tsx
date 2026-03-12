import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Home, MapPin, Umbrella } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/Navigation";
import TimeAgo from "@/components/TimeAgo";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";
import { useExternalLink } from "@/hooks/useExternalLink";

interface MarketItem {
  value: number | string;
  status?: "ok" | "stale" | "unavailable";
  asOf?: string;
  source?: {
    name: string;
    url: string;
  };
  error?: string;
}

interface MarketResponse {
  data?: {
    mortgage?: MarketItem;
    spy?: MarketItem & { change_percent?: number };
  };
}

interface WeatherResponse {
  status: "ok" | "unavailable";
  city?: string;
  tempF?: number;
  highF?: number;
  lowF?: number;
  rainProbability?: number;
  emoji?: string;
  label?: string;
  fetchedAt?: string;
}

interface NewsItem {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
}

const ASSUMED_RENTS = {
  studio: 2900,
  oneBed: 3600,
  family: 4800,
} as const;

const NEIGHBORHOODS = [
  {
    name: "Sunnyvale / Santa Clara",
    vibe: "通勤友好",
    rentLevel: "中高",
    pressure: "适合先租",
    note: "更适合看总通勤时间和生活便利性，不一定值得为了买房一步到位。",
  },
  {
    name: "Mountain View / Palo Alto",
    vibe: "学区与核心区",
    rentLevel: "高",
    pressure: "高压区",
    note: "如果预算不够宽，容易被位置和学区叙事抬高预期，先算持有压力。",
  },
  {
    name: "Fremont / Newark",
    vibe: "家庭盘",
    rentLevel: "中",
    pressure: "可观察",
    note: "适合把空间、学区和通勤做平衡，但不要忽视桥区和公司位置带来的成本。",
  },
] as const;

const BASE_CHECKLIST = {
  buy: [
    "先拿到一个可信的月供估算，不要只看挂牌价。",
    "确认首付后仍有 6-12 个月现金缓冲。",
    "把通勤时间、学区和家庭节奏写成硬约束。",
    "看房前先设定最高可接受总月支出。",
  ],
  prep: [
    "更新现金流表，把 RSU、奖金和租金都放进去看波动。",
    "把首付、closing cost、搬家和基础修缮拆开估算。",
    "列出 2-3 个真正愿意长期住的区域，而不是泛泛刷房。",
    "先看利率趋势和持有压力，再决定是否进入看房节奏。",
  ],
  rent: [
    "优先优化租约长度、室友结构和通勤成本。",
    "把省下来的月现金流留给更确定的目标。",
    "不要因为房东或市场情绪就提前进入买房流程。",
    "保持区域观察，但把行动级别控制在低成本范围内。",
  ],
} as const;

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

function monthlyPayment(principal: number, annualRate: number, years = 30) {
  const monthlyRate = annualRate / 12;
  const payments = years * 12;
  if (monthlyRate <= 0) return principal / payments;
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, payments)) /
    (Math.pow(1 + monthlyRate, payments) - 1)
  );
}

export default function Fangzi() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { handleExternalLinkClick } = useExternalLink();

  const [mortgage, setMortgage] = useState<MarketItem | null>(null);
  const [spyChangePercent, setSpyChangePercent] = useState(0);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      try {
        const [marketResp, weatherResp, newsResp] = await Promise.allSettled([
          fetch(`${config.apiBaseUrl}/api/market`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/weather`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/market-news`, {
            signal: AbortSignal.timeout(10000),
          }),
        ]);

        if (marketResp.status === "fulfilled" && marketResp.value.ok) {
          const data: MarketResponse = await marketResp.value.json();
          setMortgage(data.data?.mortgage || null);
          setSpyChangePercent(Number(data.data?.spy?.change_percent || 0));
        }

        if (weatherResp.status === "fulfilled" && weatherResp.value.ok) {
          const data: WeatherResponse = await weatherResp.value.json();
          setWeather(data);
        }

        if (newsResp.status === "fulfilled" && newsResp.value.ok) {
          const data = await newsResp.value.json();
          const items: NewsItem[] = data.items || [];
          const housingKeywords = /(rate|rates|mortgage|housing|rent|home|property|fed|利率|房|租)/i;
          const filtered = items.filter((item) => housingKeywords.test(item.title || ""));
          setNews((filtered.length > 0 ? filtered : items).slice(0, 6));
        }
      } catch (error) {
        console.error("[Fangzi] Failed to fetch housing data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
    const interval = setInterval(loadAll, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const mortgageRate = typeof mortgage?.value === "number" ? Number(mortgage.value) : null;
  const mortgagePercent = mortgageRate !== null ? mortgageRate * 100 : null;

  const housingJudgment = useMemo(() => {
    if (mortgage?.status !== "ok" || mortgagePercent === null) {
      return {
        label: "偏租",
        tone: "text-amber-300/90",
        message: "当前缺少可靠房贷利率数据，买房判断链条不够扎实，灵活租住更稳。",
        detail: "先保留流动性，等利率信号更可靠再做长期承诺。",
      };
    }

    if (mortgagePercent >= 7) {
      return {
        label: "偏租",
        tone: "text-rose-300/90",
        message: "房贷成本偏高，除非自住需求很强，否则更适合租住和观望。",
        detail: "高月供会直接吞掉现金流弹性。",
      };
    }

    if (mortgagePercent <= 5.5) {
      return {
        label: "可看买",
        tone: "text-emerald-300/90",
        message: "利率压力相对可控，如果自住需求明确，可以开始认真看盘。",
        detail: "重点比较月供、首付压力和长期通勤成本。",
      };
    }

    return {
      label: "中性",
      tone: "text-amber-300/90",
      message: "利率不算便宜，但也不是极端高位，买租都需要按个人现金流算。",
      detail: "不要凭情绪进场，先做月供和机会成本比较。",
    };
  }, [mortgage?.status, mortgagePercent]);

  const samplePayment = useMemo(() => {
    if (mortgageRate === null) return null;
    const homePrice = 1_500_000;
    const downPayment = 0.2 * homePrice;
    const principal = homePrice - downPayment;
    return Math.round(monthlyPayment(principal, mortgageRate, 30));
  }, [mortgageRate]);

  const rentVsBuy = useMemo(() => {
    const monthlyOwnershipCost =
      samplePayment !== null ? Math.round(samplePayment + 1700) : null;

    const compare = Object.entries(ASSUMED_RENTS).map(([key, rent]) => {
      const gap = monthlyOwnershipCost !== null ? monthlyOwnershipCost - rent : null;
      return { key, rent, gap };
    });

    const recommendation =
      monthlyOwnershipCost === null
        ? "当前买房成本无法可靠估算，默认先看租住方案更稳。"
        : monthlyOwnershipCost - ASSUMED_RENTS.oneBed > 2500
          ? "在当前利率假设下，买房月支出显著高于主流租住成本，偏向继续租。"
          : monthlyOwnershipCost - ASSUMED_RENTS.oneBed > 1200
            ? "买房仍明显更贵，只有自住确定性很强时才值得认真推进。"
            : "买租差距开始收窄，可以把买房纳入认真比较，而不是直接排除。";

    return {
      monthlyOwnershipCost,
      compare,
      recommendation,
    };
  }, [samplePayment]);

  const confidence = useMemo(() => {
    const score =
      (mortgage?.status === "ok" ? 45 : mortgage?.status === "stale" ? 28 : 10) +
      (weather?.status === "ok" ? 15 : 5) +
      (news.length >= 4 ? 40 : news.length >= 2 ? 28 : 12);

    if (score >= 80) {
      return { label: "高", tone: "text-emerald-300/90", detail: "利率和周边线索都比较完整。" };
    }
    if (score >= 55) {
      return { label: "中", tone: "text-amber-300/90", detail: "能做轻判断，但不适合重决策。" };
    }
    return { label: "低", tone: "text-rose-300/90", detail: "更多是方向参考，不够支持买卖级动作。" };
  }, [mortgage?.status, news.length, weather?.status]);

  const checklist = useMemo(() => {
    const buyPriority =
      mortgagePercent !== null && mortgagePercent <= 5.5
        ? "当前适合把看房从想法推进到有上限的执行。"
        : "当前更适合做买房准备，而不是快速推进签约。";

    const prepPriority =
      rentVsBuy.monthlyOwnershipCost !== null &&
      rentVsBuy.monthlyOwnershipCost - ASSUMED_RENTS.oneBed > 2000
        ? "买租差距还大，准备动作应优先于实地冲动。"
        : "买租差距在收窄，准备动作最好直接服务于实际看房。";

    const rentPriority =
      housingJudgment.label === "偏租"
        ? "现在继续租不是错过机会，而是在保护现金流弹性。"
        : "就算最终要买，短期租住优化也仍然值得做。";

    return {
      buyPriority,
      prepPriority,
      rentPriority,
      buy: BASE_CHECKLIST.buy,
      prep: BASE_CHECKLIST.prep,
      rent: BASE_CHECKLIST.rent,
    };
  }, [housingJudgment.label, mortgagePercent, rentVsBuy.monthlyOwnershipCost]);

  const weatherLine =
    weather?.status === "ok"
      ? `${weather.emoji || ""} ${weather.city || "湾区"} ${weather.tempF}°F，降雨 ${weather.rainProbability ?? 0}%`
      : "天气数据不可用";

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="route-shell mx-auto w-full max-w-6xl px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-[1.4rem] p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <BackToHomeLink />
              <div className="route-header">
                <div className="min-w-0">
                  <div className="section-kicker mb-3">
                    <div className="eyebrow">Housing Briefing</div>
                    <span className="briefing-badge">Rent vs buy</span>
                  </div>
                  <h1 className="text-2xl font-semibold leading-tight text-foreground md:text-[34px] md:leading-[1.08]">
                    {t.fangzi.title}
                  </h1>
                  <div className="mt-2 text-sm font-medium text-primary/90 md:text-base">
                    {t.fangzi.subtitle}
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    不做房源瀑布流，只先回答一个更现实的问题：现在更适合看房、继续租，还是只保持关注。
                  </p>
                </div>
                <div className="route-summary">
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className={`text-[11px] uppercase tracking-[0.16em] ${housingJudgment.tone}`}>
                      Housing Stance
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      {housingJudgment.message}
                    </div>
                  </div>
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">
                      Bay Area
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">{weatherLine}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm p-4 md:p-5">
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">
                  Housing Stance
                </div>
                <div className={`mt-2 text-2xl font-semibold ${housingJudgment.tone}`}>
                  {housingJudgment.label}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{housingJudgment.detail}</div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                  Mortgage
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {mortgagePercent !== null ? `${mortgagePercent.toFixed(2)}%` : "N/A"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {mortgage?.status === "ok" ? "房贷利率信号" : "当前没有可靠利率源"}
                </div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">
                  Sample Payment
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {samplePayment ? `$${samplePayment.toLocaleString()}` : "--"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  1.5M 房价、20% 首付、30年估算月供
                </div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-violet-300/75">
                  Confidence
                </div>
                <div className={`mt-2 text-2xl font-semibold ${confidence.tone}`}>
                  {confidence.label}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{confidence.detail}</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Rates
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {mortgagePercent !== null
                    ? `当前利率 ${mortgagePercent.toFixed(2)}%，${mortgagePercent >= 7 ? "月供压力大。" : mortgagePercent <= 5.5 ? "成本相对可谈。" : "仍需谨慎算账。"}`
                    : "利率数据暂时不可用，今天不适合做重判断。"}
                </div>
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Risk Appetite
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  SPY {spyChangePercent >= 0 ? "+" : ""}
                  {spyChangePercent.toFixed(2)}%，
                  {spyChangePercent > 0.5
                    ? "风险偏好在升，买房情绪也更容易被抬高。"
                    : spyChangePercent < -0.5
                      ? "风险偏好在降，更该重看现金流。"
                      : "市场背景中性，回到个人住房需求本身。"}
                </div>
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Living Context
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {weather?.status === "ok"
                    ? `${weather.city} ${weather.label}，高温 ${weather.highF}°F / 低温 ${weather.lowF}°F。`
                    : "天气不可用，但不影响住房主判断。"}
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Rent Vs Buy</div>
              <h2 className="text-xl font-semibold text-foreground">租买对比</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                不假装知道你的真实预算，只用透明假设先判断现在是不是明显更适合租。
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-sm border border-border/25 bg-background/35 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Estimated Ownership Cost
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-foreground">
                      {rentVsBuy.monthlyOwnershipCost
                        ? `$${rentVsBuy.monthlyOwnershipCost.toLocaleString()}/mo`
                        : "--"}
                    </div>
                  </div>
                  <span className="signal-chip">
                    <span className="signal-dot bg-emerald-400 text-emerald-400" />
                    1.5M home / 20% down
                  </span>
                </div>
                <div className="text-sm leading-6 text-foreground/88">
                  {rentVsBuy.recommendation}
                </div>
                <div className="mt-3 text-xs leading-5 text-muted-foreground/72">
                  假设包含按揭月供 + 粗略税费/保险/维护缓冲，不包含装修、HOA、交易成本和机会成本。
                </div>
              </div>

              <div className="grid gap-3">
                {rentVsBuy.compare.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-sm border border-border/25 bg-background/35 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">
                        {item.key === "studio"
                          ? "单人住"
                          : item.key === "oneBed"
                            ? "一居室"
                            : "家庭租住"}
                      </div>
                      <div className="text-sm font-mono text-muted-foreground">
                        ${item.rent.toLocaleString()}/mo
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      {item.gap === null
                        ? "当前无法可靠比较买租差距。"
                        : item.gap > 0
                          ? `买房每月大约多出 $${item.gap.toLocaleString()}。`
                          : `买房每月大约少出 $${Math.abs(item.gap).toLocaleString()}。`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Neighborhood Lens</div>
              <h2 className="text-xl font-semibold text-foreground">湾区区域视角</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                不做假 listings，直接告诉你不同区域更该先算什么。
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              {NEIGHBORHOODS.map((neighborhood) => (
                <div
                  key={neighborhood.name}
                  className="rounded-sm border border-border/25 bg-background/35 p-4"
                >
                  <div className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                    <MapPin className="h-3.5 w-3.5" />
                    {neighborhood.vibe}
                  </div>
                  <div className="text-base font-semibold text-foreground">{neighborhood.name}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="signal-chip">
                      <span className="signal-dot bg-sky-400 text-sky-400" />
                      租金 {neighborhood.rentLevel}
                    </span>
                    <span className="signal-chip">
                      <span className="signal-dot bg-amber-400 text-amber-400" />
                      {neighborhood.pressure}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-foreground/88">
                    {neighborhood.note}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Checklist</div>
              <h2 className="text-xl font-semibold text-foreground">买房准备清单</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                把房子页变成能马上执行的工具，而不是只给一个模糊 stance。
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <div className="rounded-sm border border-border/25 bg-background/35 p-4">
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300/82">
                  <Home className="h-3.5 w-3.5" />
                  Buy Track
                </div>
                <div className="mb-3 text-sm leading-6 text-foreground/88">
                  {checklist.buyPriority}
                </div>
                <div className="space-y-2">
                  {checklist.buy.map((item) => (
                    <div
                      key={item}
                      className="rounded-sm border border-border/20 bg-background/30 px-3 py-2.5 text-sm leading-6 text-foreground/84"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-sm border border-border/25 bg-background/35 p-4">
                <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-sky-300/82">
                  Prep Track
                </div>
                <div className="mb-3 text-sm leading-6 text-foreground/88">
                  {checklist.prepPriority}
                </div>
                <div className="space-y-2">
                  {checklist.prep.map((item) => (
                    <div
                      key={item}
                      className="rounded-sm border border-border/20 bg-background/30 px-3 py-2.5 text-sm leading-6 text-foreground/84"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-sm border border-border/25 bg-background/35 p-4">
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-amber-300/82">
                  <Umbrella className="h-3.5 w-3.5" />
                  Rent Track
                </div>
                <div className="mb-3 text-sm leading-6 text-foreground/88">
                  {checklist.rentPriority}
                </div>
                <div className="space-y-2">
                  {checklist.rent.map((item) => (
                    <div
                      key={item}
                      className="rounded-sm border border-border/20 bg-background/30 px-3 py-2.5 text-sm leading-6 text-foreground/84"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Source Confidence</div>
              <h2 className="text-xl font-semibold text-foreground">可信度与依据</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                房子页先透明说明“这轮判断靠什么”，避免把缺失数据包装成强结论。
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Mortgage Feed
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {mortgage?.status === "ok"
                    ? `状态正常，来源 ${mortgage.source?.name || "market feed"}。`
                    : "当前市场接口没有可靠 mortgage 数据，所以判断自然更保守。"}
                </div>
                {mortgage?.asOf ? (
                  <div className="mt-2 text-[11px] font-mono text-muted-foreground/65">
                    <TimeAgo isoString={mortgage.asOf} />
                  </div>
                ) : null}
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Weather Feed
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {weather?.status === "ok"
                    ? "天气只是湾区生活背景补充，不直接决定买租。"
                    : "天气数据不可用，影响有限。"}
                </div>
                {weather?.fetchedAt ? (
                  <div className="mt-2 text-[11px] font-mono text-muted-foreground/65">
                    <TimeAgo isoString={weather.fetchedAt} />
                  </div>
                ) : null}
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  News Feed
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {news.length > 0
                    ? `筛到 ${news.length} 条相关线索，用于判断利率/住房情绪。`
                    : "暂无足够相关线索，页面更依赖基础利率判断。"}
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Housing Notes</div>
              <h2 className="text-xl font-semibold text-foreground">住房线索</h2>
              <p className="mt-1 text-sm text-muted-foreground/72">
                不追求面面俱到，只保留今天还值得点开的住房相关线索。
              </p>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="grid gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-sm bg-muted/40" />
                  ))}
                </div>
              ) : news.length === 0 ? (
                <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  暂时没有抓到住房相关线索。
                </div>
              ) : (
                <div className="space-y-3">
                  {news.map((item, idx) => (
                    <a
                      key={`${item.url}-${idx}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleExternalLinkClick}
                      className="group flex items-start gap-3 rounded-sm border border-border/30 bg-card/45 p-4 transition-all hover:border-primary/35 hover:bg-card/65"
                    >
                      <span className="shrink-0 rounded-sm bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                        {item.source || "News"}
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

          <section className="section-shell rounded-sm">
            <div className="border-b border-border/30 p-5">
              <div className="eyebrow mb-2">Action Layer</div>
              <h2 className="text-xl font-semibold text-foreground">今天更适合做什么</h2>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-foreground/82">
                  <Home className="h-3.5 w-3.5" />
                  看房
                </div>
                <div className="text-sm leading-6 text-foreground/88">
                  {mortgagePercent !== null && mortgagePercent <= 5.5
                    ? "如果自住需求明确，可以认真开始看盘和算总成本。"
                    : "先少量看盘校准预期，不要急着进入谈价阶段。"}
                </div>
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-foreground/82">
                  <Umbrella className="h-3.5 w-3.5" />
                  继续租
                </div>
                <div className="text-sm leading-6 text-foreground/88">
                  {housingJudgment.label === "偏租"
                    ? "当前更适合保留灵活性，把现金流压力留给更确定的目标。"
                    : "即使没有马上买，也可以用租约长度和通勤成本做优化。"}
                </div>
              </div>
              <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-3">
                <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-foreground/82">
                  准备
                </div>
                <div className="text-sm leading-6 text-foreground/88">
                  今天最稳的动作通常是补现金流表、估月供、看学区/通勤边界，而不是冲动下 offer。
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-12 border-t border-border py-6">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-xs font-mono text-muted-foreground/55 md:flex-row md:text-left">
            <div>
              <span className="text-sm font-semibold text-emerald-300/85">
                {t.home.footerTagline}
              </span>
              <span className="ml-2">
                | {t.fangzi.title} - {t.fangzi.subtitle}
              </span>
            </div>
            <span>{t.home.footerSub}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
