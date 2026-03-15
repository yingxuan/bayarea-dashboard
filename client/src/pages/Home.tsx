import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import Navigation from "@/components/Navigation";
import PortfolioHero from "@/components/PortfolioHero";
import IndicesCard from "@/components/IndicesCard";
import MarketHighlights from "@/components/MarketHighlights";
import ReturnHintToast, { ReturnToDashboardToast } from "@/components/ReturnHintToast";
import LayoffsWidget from "@/components/LayoffsWidget";
import OfferCommunityWidget from "@/components/OfferCommunityWidget";
import CompactVideoFeed from "@/components/CompactVideoFeed";
import { useAuthAwareHoldings } from "@/hooks/useAuthAwareHoldings";
import { QuoteData } from "@/hooks/usePortfolioSummary";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";
import { generateJobMarketJudgment } from "@/lib/judgment";

const FortuneWidget = lazy(() => import("@/components/FortuneWidget"));
const TodaySpendCarousels = lazy(() => import("@/components/TodaySpendCarousels"));

interface MarketNewsItem {
  title?: string;
  title_zh?: string;
  title_en?: string;
  url?: string;
  id?: string;
  publishedAt?: string;
}

interface HomeJobItem {
  category?: "layoff" | "hiring" | "discussion";
}

function HomeModuleFallback() {
  return <div className="min-h-16 rounded-sm bg-muted/20" />;
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
    isStandalone,
  } = useExternalLink();
  const { holdings, isLoaded: holdingsLoaded, ytdBaseline, updateYtdBaseline } =
    useAuthAwareHoldings();

  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  const [marketNews, setMarketNews] = useState<MarketNewsItem[]>([]);
  const [layoffCount, setLayoffCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);
  const [newPlacesCount, setNewPlacesCount] = useState(0);

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
        const [marketResp, jobsResp, offersResp, newPlacesResp] = await Promise.allSettled([
          fetch(`${config.apiBaseUrl}/api/market-news`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/community/jobs`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/community/offers`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/spend/new-places`, { signal: AbortSignal.timeout(10000) }),
        ]);

        if (marketResp.status === "fulfilled" && marketResp.value.ok) {
          const result = await marketResp.value.json();
          setMarketNews(result.items || []);
        } else {
          setMarketNews([]);
        }

        if (jobsResp.status === "fulfilled" && jobsResp.value.ok) {
          const result = await jobsResp.value.json();
          setLayoffCount(
            (result.items || []).filter((item: HomeJobItem) => item.category === "layoff").length,
          );
        } else {
          setLayoffCount(0);
        }

        if (offersResp.status === "fulfilled" && offersResp.value.ok) {
          const result = await offersResp.value.json();
          setOfferCount((result.items || []).length);
        } else {
          setOfferCount(0);
        }

        if (newPlacesResp.status === "fulfilled" && newPlacesResp.value.ok) {
          const result = await newPlacesResp.value.json();
          setNewPlacesCount((result.places || []).length);
        } else {
          setNewPlacesCount(0);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch homepage feeds:", error);
        setMarketNews([]);
        setLayoffCount(0);
        setOfferCount(0);
        setNewPlacesCount(0);
      }
    }

    loadHomeFeeds();
    const interval = setInterval(loadHomeFeeds, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const marketLine = useMemo(() => {
    if (!holdingsLoaded || holdings.length === 0) {
      return lang === "en" ? "Stocks first: check the tape before adding risk" : "股市先看大盘和仓位";
    }

    const changes = holdings
      .map((holding) => quotesData[holding.ticker.toUpperCase()]?.changePercent)
      .filter((value): value is number => typeof value === "number");
    const avgChange =
      changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;

    if (avgChange >= 1) {
      return lang === "en" ? "Stocks look constructive today" : "股市偏强，今天有进攻空间";
    }

    if (avgChange <= -1) {
      return lang === "en" ? "Stocks are weak today, stay defensive" : "股市偏弱，今天先防守";
    }

    return lang === "en" ? "Stocks are choppy, observe first" : "股市震荡，先观察";
  }, [holdings, holdingsLoaded, lang, quotesData]);

  const workLine = useMemo(() => {
    const judgment = generateJobMarketJudgment({
      layoffCount,
      hiringCount: offerCount,
      techStockTrend: "flat",
      spyChangePercent: 0,
    });

    if (layoffCount > offerCount) {
      return lang === "en"
        ? `Tech hiring is cold: ${layoffCount} layoff items outweigh offers`
        : `码农行业偏冷，裁员 ${layoffCount} 条比 offer/面经 ${offerCount} 条更强`;
    }

    if (offerCount > layoffCount) {
      return lang === "en"
        ? `Tech hiring is ${judgment.temperatureLabel.toLowerCase()}: offers are beating layoffs`
        : `码农行业 ${judgment.temperatureLabel}，offer/面经 ${offerCount} 条比裁员 ${layoffCount} 条更有看头`;
    }

    return lang === "en"
      ? `Tech hiring is ${judgment.temperatureLabel.toLowerCase()} with both layoffs and offers updating`
      : `码农行业 ${judgment.temperatureLabel}，裁员和 offer/面经都在更新`;
  }, [lang, layoffCount, offerCount]);

  const homeOneLiner = useMemo(() => {
    const foodLine =
      lang === "en"
        ? newPlacesCount > 0
          ? `${newPlacesCount} new spots are worth a look`
          : "check Dining for fresh spots"
        : newPlacesCount > 0
          ? `新店打卡今天有 ${newPlacesCount} 家可刷`
          : "吃喝页可以直接看新店打卡";

    const rateLine =
      lang === "en" ? "30Y mortgage is still around 6.11%" : "30 年固定房贷约 6.11%，还在高位";

    return `${marketLine}；${workLine}；${foodLine}；${rateLine}。`;
  }, [lang, marketLine, newPlacesCount, workLine]);

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
          <motion.div className="mb-4 w-full min-w-0" variants={fadeInUp}>
            <Suspense fallback={<HomeModuleFallback />}>
              <FortuneWidget />
            </Suspense>
          </motion.div>

          <motion.section
            className="w-full rounded-[1.1rem] border border-border/25 bg-card/45 px-4 py-3"
            variants={fadeInUp}
          >
            <div className="text-sm leading-7 text-foreground/88 md:text-[15px]">{homeOneLiner}</div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-market rounded-[1.25rem] p-3 md:p-4"
            variants={fadeInUp}
          >
            <h2 className="mb-4 text-xl font-semibold text-foreground">{t.home.sectionMarket}</h2>

            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
              <div className="grid gap-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[2.2fr_1fr]">
                  <PortfolioHero
                    quotesData={quotesData}
                    holdings={holdings}
                    holdingsLoaded={holdingsLoaded}
                    ytdBaseline={ytdBaseline}
                    onYtdBaselineChange={updateYtdBaseline}
                  />
                  <IndicesCard />
                </div>
                <MarketHighlights
                  marketNews={marketNews}
                  maxItems={4}
                  title={lang === "en" ? "Market News" : "财经快讯"}
                />
              </div>
              <div className="min-w-0 self-stretch">
                <CompactVideoFeed
                  kind="stock"
                  maxItems={2}
                  title={lang === "en" ? "Market Videos" : "财经视频"}
                  subtitle=""
                  moreHref="/piaozi"
                />
              </div>
            </div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-work rounded-[1.25rem] p-3 md:p-4"
            variants={fadeInUp}
          >
            <h2 className="mb-4 text-xl font-semibold text-foreground">{t.home.sectionWork}</h2>

            <div className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground/88">
                    {lang === "en" ? "Layoff News" : "裁员新闻"}
                  </h3>
                  <LayoffsWidget />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground/88">
                    {lang === "en" ? "Offers / Interview Notes" : "Offer / 面经"}
                  </h3>
                  <OfferCommunityWidget maxItems={6} />
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground/88">
                  {lang === "en" ? "Career Videos" : "找工视频"}
                </h3>
                <CompactVideoFeed
                  kind="career"
                  maxItems={8}
                  layout="carousel"
                  hideHeader
                  carouselItemClassName="min-w-0 shrink-0 pl-3 md:basis-1/2 xl:basis-1/3 2xl:basis-1/4"
                />
              </div>
            </div>
          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-food rounded-[1.25rem] p-3 md:p-4"
            variants={fadeInUp}
          >
            <div className="w-full min-w-0">
              <Suspense fallback={<HomeModuleFallback />}>
                <TodaySpendCarousels />
              </Suspense>
            </div>
          </motion.section>
        </motion.div>
      </main>
    </div>
  );
}
