import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import FortuneWidget from "@/components/FortuneWidget";
import Navigation from "@/components/Navigation";
import TodaySpendCarousels from "@/components/TodaySpendCarousels";
import ChineseGossip from "@/components/ChineseGossip";
import PortfolioHero from "@/components/PortfolioHero";
import MarketHighlights from "@/components/MarketHighlights";
import USStockYouTubers from "@/components/USStockYouTubers";
import FanwanCarousel from "@/components/FanwanCarousel";
import IndicesCard from "@/components/IndicesCard";
import ShowsCarousel from "@/components/ShowsCarousel";
import MoviesCarousel from "@/components/MoviesCarousel";
import ConcertsCarousel from "@/components/ConcertsCarousel";
import SectionHeader from "@/components/SectionHeader";
import TimeAgo from "@/components/TimeAgo";
import ReturnHintToast, { ReturnToDashboardToast } from "@/components/ReturnHintToast";
import LayoffsWidget from "@/components/LayoffsWidget";
import BaoguoEntryCard from "@/components/BaoguoEntryCard";
import FangziEntryCard from "@/components/FangziEntryCard";
import PiaoziEntryCard from "@/components/PiaoziEntryCard";
import ChiheEntryCard from "@/components/ChiheEntryCard";
import { useAuthAwareHoldings } from "@/hooks/useAuthAwareHoldings";
import { QuoteData } from "@/hooks/usePortfolioSummary";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface MarketSnapshotItem {
  value: number | string;
  status?: "ok" | "stale" | "unavailable";
}

interface MarketSnapshotResponse {
  data?: {
    mortgage?: MarketSnapshotItem;
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default function Home() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const {
    showHint,
    dismissHint,
    showReturnHint,
    dismissReturnHint,
    handleReturnHintClick,
    handleExternalLinkClick,
    isStandalone,
  } = useExternalLink();

  const [marketNews, setMarketNews] = useState<any[]>([]);
  const [chineseNews, setChineseNews] = useState<any[]>([]);
  const [stockYoutubers, setStockYoutubers] = useState<any[]>([]);
  const [stockYoutubersOffset, setStockYoutubersOffset] = useState(0);
  const [fanwanVideos, setFanwanVideos] = useState<any[]>([]);
  const { holdings, isLoaded: holdingsLoaded, ytdBaseline, updateYtdBaseline } =
    useAuthAwareHoldings();

  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  const [shows, setShows] = useState<any[]>([]);
  const [showsOffset, setShowsOffset] = useState(0);
  const [movies, setMovies] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [dealsSourceMode, setDealsSourceMode] = useState<"live" | "cache" | "seed">("live");
  const [concerts, setConcerts] = useState<any[]>([]);
  const [mortgageRate, setMortgageRate] = useState<number | null>(null);
  const [mortgageStatus, setMortgageStatus] = useState<"ok" | "stale" | "unavailable">(
    "unavailable",
  );

  useEffect(() => {
    if (!holdingsLoaded || holdings.length === 0) {
      setQuotesData({});
      return;
    }

    const fetchQuotes = async () => {
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
        const quotes: Array<{
          ticker: string;
          status: "ok" | "stale" | "unavailable";
          price: number;
          prevClose?: number;
          change?: number;
          changePercent?: number;
          error?: string;
        }> = result.quotes || [];

        const quotesMap: Record<string, QuoteData> = {};
        quotes.forEach((quote) => {
          const price = Number(quote.price);
          const prevClose =
            quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;
          const change = quote.change !== undefined ? Number(quote.change) : undefined;
          const changePercent =
            quote.changePercent !== undefined ? Number(quote.changePercent) : undefined;

          if (isNaN(price) || price <= 0) return;

          quotesMap[quote.ticker.toUpperCase()] = {
            price,
            prevClose,
            change,
            changePercent,
            status: quote.status,
          };
        });

        setQuotesData(quotesMap);
      } catch (error) {
        console.error("[Home] Failed to fetch quotes:", error);
        setQuotesData({});
      }
    };

    fetchQuotes();
  }, [holdings, holdingsLoaded]);

  useEffect(() => {
    async function loadAllData() {
      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/market`);
        if (response.ok) {
          const result: MarketSnapshotResponse = await response.json();
          const mortgage = result.data?.mortgage;
          const nextRate =
            typeof mortgage?.value === "number"
              ? Number(mortgage.value) * 100
              : typeof mortgage?.value === "string" && !isNaN(Number(mortgage.value))
                ? Number(mortgage.value) * 100
                : null;
          setMortgageRate(nextRate);
          setMortgageStatus(mortgage?.status || "unavailable");
        } else {
          setMortgageRate(null);
          setMortgageStatus("unavailable");
        }
      } catch (error) {
        console.error("[Home] Failed to fetch market snapshot:", error);
        setMortgageRate(null);
        setMortgageStatus("unavailable");
      }

      try {
        const apiUrl = `${config.apiBaseUrl}/api/market-news`;
        const response = await fetchWithTimeout(apiUrl);
        if (response.ok) {
          const result = await response.json();
          const newsItems = result.items || [];
          if (newsItems.length > 0) {
            setMarketNews(newsItems.slice(0, 3));
            setChineseNews([]);
          } else {
            setMarketNews([]);
            setChineseNews([]);
          }
        } else {
          setMarketNews([]);
          setChineseNews([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch market news:", error);
        setMarketNews([]);
        setChineseNews([]);
      }

      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/youtubers?category=stock`);
        if (response.ok) {
          const result = await response.json();
          const items = result.items || result.youtubers || [];
          const channelMap = new Map<string, any>();
          items.forEach((item: any) => {
            const channelName = item.channelName || item.channel || "";
            if (channelName && item.status === "ok") {
              if (!channelMap.has(channelName)) {
                channelMap.set(channelName, item);
              } else {
                const existing = channelMap.get(channelName);
                const existingTime = new Date(existing.publishedAt || 0).getTime();
                const currentTime = new Date(item.publishedAt || 0).getTime();
                if (currentTime > existingTime) {
                  channelMap.set(channelName, item);
                }
              }
            }
          });
          setStockYoutubers(Array.from(channelMap.values()).slice(0, 8));
          setStockYoutubersOffset(0);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch stock youtubers:", error);
        setStockYoutubers([]);
        setStockYoutubersOffset(0);
      }

      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/youtube/fanwan`);
        if (response.ok) {
          const result = await response.json();
          setFanwanVideos(result.videos || []);
        } else {
          setFanwanVideos([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch fanwan videos:", error);
        setFanwanVideos([]);
      }

      try {
        const apiUrl = `${config.apiBaseUrl}/api/shows`;
        const response = await fetchWithTimeout(apiUrl);
        if (response.ok) {
          const result = await response.json();
          const showsItems = result.items || result.shows || [];
          setShows(showsItems);
          setShowsOffset(0);
        } else {
          setShows([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch shows:", error);
        setShows([]);
      }

      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/movies`);
        if (response.ok) {
          const result = await response.json();
          setMovies(result.items || []);
        } else {
          setMovies([]);
        }
      } catch {
        setMovies([]);
      }

      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/deals`);
        if (response.ok) {
          const result = await response.json();
          const dealsItems = result.items || result.deals || [];
          if (dealsItems.length >= 3) {
            setDeals(dealsItems.slice(0, 10));
            setDealsSourceMode(result.sourceMode || "live");
          } else {
            setDeals(dealsItems);
            setDealsSourceMode(result.sourceMode || "seed");
          }
        } else {
          setDeals([]);
          setDealsSourceMode("seed");
        }
      } catch (error) {
        console.error("[Home] Failed to fetch deals:", error);
        setDeals([]);
        setDealsSourceMode("seed");
      }

      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/concerts`);
        if (response.ok) {
          const result = await response.json();
          setConcerts(result.items || []);
        } else {
          setConcerts([]);
        }
      } catch {
        setConcerts([]);
      }
    }

    loadAllData();
    const interval = setInterval(loadAllData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const moneyPulse =
    holdings.length > 0
      ? `持仓已加载，${Object.keys(quotesData).length} 个报价已就绪`
      : marketNews.length > 0
        ? `${marketNews.length} 条市场线索可快速扫完`
        : "先看大盘，再决定今天要不要操作";

  const workPulse = "先看裁员与求职动态，再决定今天要不要投、聊、等。";

  const actionPulse =
    deals.length >= 3
      ? "午饭、下班局、顺手省钱，今天都有现成答案。"
      : "先扫吃喝，再决定晚上去哪。";

  const housingPulse =
    mortgageRate !== null
      ? mortgageRate >= 7
        ? `房贷大约 ${mortgageRate.toFixed(2)}%，今天更偏向继续租或只做准备。`
        : mortgageRate <= 5.5
          ? `房贷大约 ${mortgageRate.toFixed(2)}%，如果自住需求明确，可以认真开始看房。`
          : `房贷大约 ${mortgageRate.toFixed(2)}%，买租都别凭感觉，先比较月供压力。`
      : marketNews.length > 0
        ? "先看利率和现金流，再决定现在是继续租、开始看房，还是只做准备。"
        : "房子先别靠情绪判断，先把利率、月供和通勤成本放到一张表里。";

  const housingModeLabel =
    mortgageStatus === "ok" ? "rate live" : mortgageStatus === "stale" ? "rate stale" : "rate n/a";

  const housingActionLine =
    mortgageRate !== null
      ? mortgageRate >= 7
        ? "当前买房月供压力通常明显高于主流租住成本。"
        : mortgageRate <= 5.5
          ? "买租差距开始收窄，值得把看房纳入本周任务。"
          : "现在更适合做 rent vs buy 对比，而不是直接站队。"
      : "利率源不稳定时，默认把它当成保守判断场景。";

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
          <motion.div className="hero-panel mb-5 rounded-sm p-4 md:p-6" variants={fadeInUp}>
            <div className="hero-grid">
              <div className="min-w-0">
                <div className="eyebrow mb-3">Daily Brief</div>
                <div className="max-w-2xl">
                  <h1 className="text-2xl font-semibold leading-tight text-foreground md:text-[32px] md:leading-[1.1]">
                    {t.home.briefingTitle}
                  </h1>
                  <div className="mt-2 text-sm font-medium text-primary/90 md:text-base">
                    {t.home.briefingSubtitle}
                  </div>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    {t.home.briefingDesc}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="signal-chip">
                    <span className="signal-dot bg-cyan-400 text-cyan-400" />
                    {t.home.freshness}
                  </span>
                  <span className="signal-chip">
                    <span className="signal-dot bg-emerald-400 text-emerald-400" />
                    {t.home.quality}
                  </span>
                  <span className="signal-chip">
                    <span className="signal-dot bg-amber-400 text-amber-400" />
                    {t.home.bayArea}
                  </span>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="hero-pulse-card rounded-sm p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/75">
                    {t.home.moneyPulse}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">{moneyPulse}</div>
                </div>
                <div className="hero-pulse-card rounded-sm p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                    {t.home.workPulse}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">{workPulse}</div>
                </div>
                <div className="hero-pulse-card rounded-sm p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-violet-300/75">
                    {t.home.actionPulse}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-foreground/88">{actionPulse}</div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div className="mb-5 w-full min-w-0" variants={fadeInUp}>
            <FortuneWidget />
          </motion.div>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-market flex min-w-0 flex-col gap-5 rounded-sm p-4 md:p-5"
            variants={fadeInUp}
          >
            <div>
              <div className="eyebrow mb-2">Money</div>
              <h2 className="text-lg font-semibold tracking-[0.01em] text-cyan-300/90">
                {t.home.sectionMarket}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground/78">
                先看持仓、指数和市场线索，再决定今天该不该动。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[2.2fr_1fr]">
              <div className="min-w-0">
                <PortfolioHero
                  quotesData={quotesData}
                  holdings={holdings}
                  holdingsLoaded={holdingsLoaded}
                  ytdBaseline={ytdBaseline}
                  onYtdBaselineChange={updateYtdBaseline}
                />
              </div>
              <div className="min-w-0">
                <IndicesCard />
              </div>
            </div>

            <div className="w-full min-w-0">
              <SectionHeader title={t.home.marketHighlights} tone="market" />
              <MarketHighlights marketNews={marketNews} />
            </div>

            {(stockYoutubers.some((v) => v.status === "ok") || fanwanVideos.length > 0) && (
              <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                {stockYoutubers.some((v) => v.status === "ok") && (
                  <div className="min-w-0 overflow-hidden">
                    <USStockYouTubers
                      stockYoutubers={stockYoutubers}
                      offset={stockYoutubersOffset}
                      onRefresh={() => {
                        const videosPerBatch = 4;
                        setStockYoutubersOffset((prev) => {
                          const nextOffset = prev + videosPerBatch;
                          return nextOffset >= stockYoutubers.length ? 0 : nextOffset;
                        });
                      }}
                    />
                  </div>
                )}
                {fanwanVideos.length > 0 && (
                  <div className="min-w-0 overflow-hidden">
                    <FanwanCarousel videos={fanwanVideos} />
                  </div>
                )}
              </div>
            )}

            <div className="w-full min-w-0">
              <PiaoziEntryCard />
            </div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-housing flex min-w-0 flex-col gap-5 rounded-sm p-4 md:p-5"
            variants={fadeInUp}
          >
            <div>
              <div className="eyebrow mb-2">Work</div>
              <h2 className="text-lg font-semibold tracking-[0.01em] text-sky-300/90">
                {t.home.sectionWork}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground/78">
                不把工作区做成恐慌信息流，先看裁员与找工信号，再决定今天要不要投、聊、等。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="min-w-0">
                <LayoffsWidget />
              </div>
              <div className="min-w-0">
                <ChineseGossip maxItemsPerSource={4} />
              </div>
            </div>

            <div className="w-full min-w-0">
              <BaoguoEntryCard />
            </div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell flex min-w-0 flex-col gap-5 rounded-sm p-4 md:p-5"
            variants={fadeInUp}
          >
            <div>
              <div className="eyebrow mb-2">Housing</div>
              <h2 className="text-lg font-semibold tracking-[0.01em] text-emerald-300/90">
                {t.home.sectionHousing}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground/78">
                不做房源瀑布流，先把利率、月供压力和湾区居住现实压成一页判断。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.05fr_0.95fr_1fr]">
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">
                    Housing stance
                  </div>
                  <span className="signal-chip shrink-0">
                    <span className="signal-dot bg-emerald-400 text-emerald-400" />
                    {housingModeLabel}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">{housingPulse}</div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">
                  Rent vs buy pulse
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  {housingActionLine}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground/72">
                  重点不是“涨还是跌”的口号，而是你的月供弹性、首付占用和通勤边界。
                </div>
              </div>
              <div className="hero-pulse-card rounded-sm p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                  Bay Area lens
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/88">
                  South Bay 更该先算通勤，半岛更该先算预算上限，家庭盘更该先算学区和持有压力。
                </div>
              </div>
            </div>

            <div className="w-full min-w-0">
              <FangziEntryCard />
            </div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-food flex min-w-0 flex-col gap-5 rounded-sm p-4 md:p-5"
            variants={fadeInUp}
          >
            <div>
              <div className="eyebrow mb-2">Food</div>
              <h2 className="text-lg font-semibold tracking-[0.01em] text-amber-300/90">
                {t.home.sectionFood}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground/78">
                下班吃什么、去哪聚、值不值得专门跑一趟，这里先替你筛过一轮。
              </p>
            </div>

            <div className="w-full min-w-0">
              <TodaySpendCarousels />
            </div>

            <div className="w-full min-w-0">
              <ChiheEntryCard />
            </div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-ent flex min-w-0 flex-col gap-5 rounded-sm p-4 md:p-5"
            variants={fadeInUp}
          >
            <div>
              <div className="eyebrow mb-2">After Work</div>
              <h2 className="text-lg font-semibold tracking-[0.01em] text-violet-300/90">
                {t.home.sectionEnt}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground/78">
                娱乐放后面，但别错过今天值得聊、值得看、值得顺手捡的钱。
              </p>
            </div>

            {shows.length > 0 && (
              <div className="w-full min-w-0 overflow-hidden">
                <ShowsCarousel
                  shows={shows}
                  offset={showsOffset}
                  onRefresh={() => {
                    setShowsOffset((prev) => (prev + 1 >= 10 ? 0 : prev + 1));
                  }}
                />
              </div>
            )}

            {movies.length > 0 && (
              <div className="w-full min-w-0 overflow-hidden">
                <MoviesCarousel movies={movies} />
              </div>
            )}

            {concerts.length > 0 && (
              <div className="w-full min-w-0 overflow-hidden">
                <ConcertsCarousel concerts={concerts} />
              </div>
            )}

            <div className="flex w-full min-w-0 flex-col gap-4 md:flex-row md:items-stretch">
              <div className="flex w-full min-w-0 flex-col md:w-3/5">
                <SectionHeader title={t.home.gossip} tone="ent" />
                <div className="flex-1">
                  <ChineseGossip maxItemsPerSource={5} />
                </div>
              </div>

              {deals.length >= 3 && (
                <div className="flex w-full min-w-0 flex-col md:w-2/5">
                  <div className="mb-2">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <div>
                        <div className="eyebrow mb-2">Deals</div>
                        <h3 className="text-[15px] font-semibold text-violet-200/90">
                          {t.home.deals}
                        </h3>
                      </div>
                      <span className="signal-chip shrink-0">
                        <span className="signal-dot bg-violet-400 text-violet-400" />
                        {dealsSourceMode === "live"
                          ? t.home.live
                          : dealsSourceMode === "cache"
                            ? t.home.cache
                            : t.home.seed}
                      </span>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-border/80 to-transparent" />
                  </div>
                  <div className="content-list flex-1 divide-y divide-border/20 rounded-sm px-2 py-1">
                    {deals.slice(0, 5).map((deal) => (
                      <a
                        key={deal.id}
                        href={deal.external_url || deal.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleExternalLinkClick}
                        className="group flex items-baseline gap-2 rounded-sm px-2 py-2.5 transition-colors hover:bg-muted/30"
                      >
                        <span className="shrink-0 text-[11px] font-mono text-muted-foreground/65">
                          {deal.sourceLabel || deal.source || deal.store || "Deal"}
                          {deal.publishedAt ? (
                            <>
                              {" "}
                              · <TimeAgo isoString={deal.publishedAt} />
                            </>
                          ) : deal.time_ago ? (
                            <> · {deal.time_ago}</>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 line-clamp-1 text-[13px] leading-tight text-foreground/88 transition-colors group-hover:text-primary">
                          {deal.title}
                        </span>
                        {deal.score !== undefined && deal.score > 0 && (
                          <span className="shrink-0 text-[11px] font-mono tabular-nums text-primary">
                            ↑{deal.score}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      </main>

      <footer className="mt-12 border-t border-border py-6">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-xs font-mono text-muted-foreground/55 md:flex-row md:text-left">
            <span className="text-sm font-semibold text-cyan-300/85">{t.home.footerTagline}</span>
            <span>{t.home.footerSub}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
