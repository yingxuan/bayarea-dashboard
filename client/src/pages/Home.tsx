import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, BellDot, BriefcaseBusiness, ChartColumnBig, House, Soup } from "lucide-react";
import { Link } from "wouter";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import Navigation from "@/components/Navigation";
import PortfolioHero from "@/components/PortfolioHero";
import MarketHighlights from "@/components/MarketHighlights";
import ReturnHintToast, { ReturnToDashboardToast } from "@/components/ReturnHintToast";
import LayoffsWidget from "@/components/LayoffsWidget";
import OfferCommunityWidget, { HOME_PACKAGE_PREVIEW_COUNT } from "@/components/OfferCommunityWidget";
import StartupNewsList from "@/components/StartupNewsList";
import CompactVideoFeed from "@/components/CompactVideoFeed";
import { useAuthAwareHoldings } from "@/hooks/useAuthAwareHoldings";
import { QuoteData, usePortfolioSummary } from "@/hooks/usePortfolioSummary";
import { useExternalLink } from "@/hooks/useExternalLink";
import { BriefItem, useDailyBriefState } from "@/hooks/useDailyBriefState";
import { usePlacesCache } from "@/hooks/usePlacesCache";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";

const FortuneWidget = lazy(() => import("@/components/FortuneWidget"));

interface MarketNewsItem {
  title?: string;
  title_zh?: string;
  title_en?: string;
  url?: string;
  id?: string;
  publishedAt?: string;
}

interface JobItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  category?: "layoff" | "hiring" | "discussion";
}

interface BriefPlace {
  name: string;
  rating?: number;
  city?: string;
  category?: string;
}

const BRIEF_ZIP_MARKETS = [
  { zip: "95014", region: "Cupertino", medianSalePrice: "$3.23M", yoy: "+28.1%" },
  { zip: "94043", region: "Palo Alto / 94043", medianSalePrice: "$2.48M", yoy: "+4.9%" },
  { zip: "94087", region: "Sunnyvale", medianSalePrice: "$2.71M", yoy: "+3.9%" },
  { zip: "95129", region: "West San Jose", medianSalePrice: "$2.42M", yoy: "+6.3%" },
  { zip: "94539", region: "Fremont Mission", medianSalePrice: "$1.85M", yoy: "-8.6%" },
];
const HOUSING_BRIEF_MARKET = BRIEF_ZIP_MARKETS[0];

function HomeModuleFallback() {
  return <div className="min-h-16 rounded-sm bg-muted/20" />;
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

export default function Home() {
  const { lang } = useLanguage();
  const {
    showHint,
    dismissHint,
    showReturnHint,
    dismissReturnHint,
    handleReturnHintClick,
    isStandalone,
  } = useExternalLink();
  const { holdings, isLoaded: holdingsLoaded, ytdBaseline, updateYtdBaseline } =
    useAuthAwareHoldings();
  const {
    isFirstBriefToday,
    markBriefSeen,
    markItemsSeen,
    markSectionVisited,
    getUnreadCount,
  } = useDailyBriefState();

  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  const [marketNews, setMarketNews] = useState<MarketNewsItem[]>([]);
  const [workItems, setWorkItems] = useState<JobItem[]>([]);
  const [activeWorkTab, setActiveWorkTab] = useState<"layoff" | "offer">("layoff");
  const { placesByCategory, loading: placesLoading } = usePlacesCache([
    "\u65b0\u5e97\u6253\u5361",
    "\u4e2d\u9910",
    "\u5976\u8336",
    "\u591c\u5bb5",
  ]);
  const [briefWasFirstToday] = useState(() => isFirstBriefToday);
  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  const marketBriefItems = useMemo<BriefItem[]>(
    () =>
      marketNews.slice(0, 3).map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title || item.title_en || item.title_zh,
        publishedAt: item.publishedAt,
      })),
    [marketNews],
  );

  const financeUnreadCount = getUnreadCount("finance", marketBriefItems);
  const hasPortfolioValue = holdingsLoaded && holdings.length > 0 && portfolioMetrics.portfolioValue > 0;
  const dailyChangeIsPositive = portfolioMetrics.dailyChangeAmount >= 0;
  const topWorkItem = useMemo(
    () =>
      workItems.find((item) => item.category === "layoff") ||
      workItems.find((item) => item.category === "hiring") ||
      workItems[0],
    [workItems],
  );
  const topFoodPlace = useMemo<BriefPlace | undefined>(() => {
    const categories = ["\u65b0\u5e97\u6253\u5361", "\u4e2d\u9910", "\u5976\u8336", "\u591c\u5bb5"];
    for (const category of categories) {
      const place = placesByCategory[category]?.[0];
      if (place) return { ...place, category };
    }
    return undefined;
  }, [placesByCategory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      markBriefSeen();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [markBriefSeen]);

  useEffect(() => {
    if (!holdingsLoaded || holdings.length === 0) {
      setQuotesData({});
      return;
    }

    async function fetchQuotes() {
      try {
        const tickers = holdings.map((h) => h.ticker.toUpperCase()).join(",");
        const apiUrl = `${config.apiBaseUrl}/api/quotes?tickers=${encodeURIComponent(tickers)}`;
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`Quotes API error: ${response.status}`);
        }

        const result = await response.json();
        const quotesMap: Record<string, QuoteData> = {};

        for (const quote of result.quotes || []) {
          const price = Number(quote.price);
          if (isNaN(price) || price <= 0) continue;
          quotesMap[quote.ticker.toUpperCase()] = {
            price,
            prevClose: quote.prevClose !== undefined ? Number(quote.prevClose) : undefined,
            change: quote.change !== undefined ? Number(quote.change) : undefined,
            changePercent: quote.changePercent !== undefined ? Number(quote.changePercent) : undefined,
            status: quote.status,
          };
        }

        setQuotesData(quotesMap);
      } catch (error) {
        console.error("[Home] Failed to fetch quotes:", error);
        setQuotesData({});
      }
    }

    fetchQuotes();
  }, [holdings, holdingsLoaded]);

  useEffect(() => {
    async function loadHomeFeeds() {
      try {
        const [marketResp, jobsResp] = await Promise.allSettled([
          fetch(`${config.apiBaseUrl}/api/market-news`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/community/jobs`, { signal: AbortSignal.timeout(10000) }),
        ]);

        if (marketResp.status === "fulfilled" && marketResp.value.ok) {
          const result = await marketResp.value.json();
          setMarketNews(result.items || []);
        } else {
          setMarketNews([]);
        }

        if (jobsResp.status === "fulfilled" && jobsResp.value.ok) {
          const result = await jobsResp.value.json();
          setWorkItems(Array.isArray(result.items) ? result.items.slice(0, 8) : []);
        } else {
          setWorkItems([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch homepage feeds:", error);
        setMarketNews([]);
        setWorkItems([]);
      }
    }

    loadHomeFeeds();
    const interval = setInterval(loadHomeFeeds, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />
      <ReturnHintToast show={showHint} onDismiss={dismissHint} isStandalone={isStandalone} />
      <ReturnToDashboardToast
        show={showReturnHint}
        onDismiss={dismissReturnHint}
        onClick={handleReturnHintClick}
      />

      <main className="w-full min-w-0">
        <motion.div
          className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6 md:py-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.section
            className="mb-4 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(140,206,222,0.20),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.24)] md:p-5"
            variants={fadeInUp}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                  <BellDot className="h-3.5 w-3.5" />
                  {briefWasFirstToday
                    ? lang === "en"
                      ? "New Today"
                      : "\u4eca\u65e5\u65b0\u5185\u5bb9"
                    : lang === "en"
                      ? "Checked Today"
                      : "\u4eca\u65e5\u5df2\u770b"}
                </div>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">
                  {lang === "en" ? "Your Bay Area brief" : "\u4f60\u7684\u6e7e\u533a\u7b80\u62a5"}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
                  {lang === "en"
                    ? "One pass for money, work, food, and housing. Start here, then jump into the tab that needs attention."
                    : "\u5148\u770b\u94b1\u3001\u5de5\u4f5c\u3001\u5403\u996d\u548c\u623f\u5b50\u7684\u53d8\u5316\uff0c\u518d\u8fdb\u5165\u9700\u8981\u5904\u7406\u7684\u680f\u76ee\u3002"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/piaozi">
                <div
                  onClick={() => {
                    markItemsSeen("finance", marketBriefItems);
                    markSectionVisited("finance");
                  }}
                  className="group cursor-pointer rounded-[1rem] border border-white/10 bg-background/42 p-4 transition hover:border-primary/30 hover:bg-background/58"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <ChartColumnBig className="h-5 w-5 text-primary" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {lang === "en" ? "Money" : "\u94b1"}
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-[-0.02em] text-foreground">
                    {hasPortfolioValue
                      ? formatCompactCurrency(portfolioMetrics.portfolioValue)
                      : lang === "en"
                        ? "Set portfolio"
                        : "\u8bbe\u7f6e\u6301\u4ed3"}
                  </div>
                  <div
                    className={`mt-1 text-sm ${
                      dailyChangeIsPositive ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {hasPortfolioValue
                      ? `${formatSignedPercent(portfolioMetrics.dailyChangePercent)} ${lang === "en" ? "today" : "\u4eca\u65e5"}`
                      : financeUnreadCount > 0
                        ? `${financeUnreadCount} ${lang === "en" ? "new headlines" : "\u6761\u65b0\u95fb"}`
                        : lang === "en"
                          ? "Track your holdings"
                          : "\u8ddf\u8e2a\u4f60\u7684\u6301\u4ed3"}
                  </div>
                </div>
              </Link>

              <Link href="/baoguo">
                <div
                  onClick={() => markSectionVisited("work")}
                  className="group cursor-pointer rounded-[1rem] border border-white/10 bg-background/42 p-4 transition hover:border-primary/30 hover:bg-background/58"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <BriefcaseBusiness className="h-5 w-5 text-primary" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {lang === "en" ? "Work" : "\u5de5\u4f5c"}
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-[-0.02em] text-foreground">
                    {topWorkItem
                      ? truncateText(topWorkItem.title, lang === "en" ? 44 : 24)
                      : lang === "en"
                        ? "Loading job pulse"
                        : "\u52a0\u8f7d\u5de5\u4f5c\u98ce\u5411"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {topWorkItem
                      ? `${topWorkItem.source}${topWorkItem.category ? ` · ${topWorkItem.category}` : ""}`
                      : lang === "en"
                        ? "Layoffs, hiring, discussions"
                        : "\u88c1\u5458\u3001\u62db\u8058\u3001\u8ba8\u8bba"}
                  </div>
                </div>
              </Link>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
                <Link href="/chihe">
                  <div
                    onClick={() => markSectionVisited("food")}
                    className="group h-full cursor-pointer rounded-[1rem] border border-white/10 bg-background/42 p-4 transition hover:border-primary/30 hover:bg-background/58"
                  >
                    <Soup className="mb-3 h-5 w-5 text-primary" />
                    <div className="text-sm font-semibold text-foreground">
                      {topFoodPlace
                        ? truncateText(topFoodPlace.name, lang === "en" ? 28 : 12)
                        : lang === "en"
                          ? "Loading picks"
                          : "\u52a0\u8f7d\u9910\u5385"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {topFoodPlace
                        ? `${topFoodPlace.category || ""}${topFoodPlace.rating ? ` · ${topFoodPlace.rating.toFixed(1)}` : ""}${topFoodPlace.city ? ` · ${topFoodPlace.city}` : ""}`
                        : placesLoading
                          ? lang === "en"
                            ? "Reading local cache"
                            : "\u8bfb\u53d6\u672c\u5730\u7f13\u5b58"
                          : lang === "en"
                            ? "Open food tab"
                            : "\u6253\u5f00\u5403\u996d"}
                    </div>
                  </div>
                </Link>
                <Link href="/fangzi">
                  <div
                    onClick={() => markSectionVisited("housing")}
                    className="group h-full cursor-pointer rounded-[1rem] border border-white/10 bg-background/42 p-4 transition hover:border-primary/30 hover:bg-background/58"
                  >
                    <House className="mb-3 h-5 w-5 text-primary" />
                    <div className="text-sm font-semibold text-foreground">
                      {`${HOUSING_BRIEF_MARKET.region} ${HOUSING_BRIEF_MARKET.medianSalePrice}`}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {lang === "en"
                        ? `${HOUSING_BRIEF_MARKET.yoy} YoY · Open live provider links`
                        : `${HOUSING_BRIEF_MARKET.yoy} YoY · \u6253\u5f00 live provider links`}
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </motion.section>

          <motion.div className="mb-4 w-full min-w-0" variants={fadeInUp}>
            <Suspense fallback={<HomeModuleFallback />}>
              <FortuneWidget />
            </Suspense>
          </motion.div>

          <motion.div className="grid gap-4" variants={fadeInUp}>
            <PortfolioHero
              quotesData={quotesData}
              holdings={holdings}
              holdingsLoaded={holdingsLoaded}
              ytdBaseline={ytdBaseline}
              onYtdBaselineChange={updateYtdBaseline}
            />
            <MarketHighlights
              marketNews={marketNews}
              maxItems={3}
              title={lang === "en" ? "Top Finance Headlines" : "新浪财经头条"}
            />
            <CompactVideoFeed
              kind="stock"
              maxItems={6}
              layout="carousel"
              embedded
              title={lang === "en" ? "US Stock Creators" : "美股博主"}
              carouselItemClassName="min-w-0 shrink-0 basis-[82%] pl-3 sm:basis-[58%] md:basis-1/2"
            />
          </motion.div>

          <div className="section-divider" />

          <motion.section className="grid gap-4" variants={fadeInUp}>
            <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkTab("layoff")}
                  className={`rounded-[0.8rem] px-3 py-2 text-sm transition ${
                    activeWorkTab === "layoff"
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {lang === "en" ? "Layoffs" : "裁员"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkTab("offer")}
                  className={`rounded-[0.8rem] px-3 py-2 text-sm transition ${
                    activeWorkTab === "offer"
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {lang === "en" ? "Packages" : "包裹"}
                </button>
              </div>
            </div>

            {activeWorkTab === "layoff" ? (
              <LayoffsWidget embedded />
            ) : (
              <OfferCommunityWidget maxItems={HOME_PACKAGE_PREVIEW_COUNT} embedded />
            )}

            <CompactVideoFeed
              kind="career"
              maxItems={6}
              layout="carousel"
              embedded
              title={lang === "en" ? "Industry / Job Videos" : "行业 / 找工视频"}
              carouselItemClassName="min-w-0 shrink-0 basis-[82%] pl-3 sm:basis-[58%] md:basis-1/2"
            />
          </motion.section>

          <div className="section-divider" />

          <motion.div variants={fadeInUp}>
            <StartupNewsList
              maxItems={4}
              title={lang === "en" ? "Bay Area Startup News" : "湾区 Startup 新闻"}
            />
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
