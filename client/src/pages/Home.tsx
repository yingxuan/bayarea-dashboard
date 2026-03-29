import { Suspense, lazy, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import Navigation from "@/components/Navigation";
import PortfolioHero from "@/components/PortfolioHero";
import MarketHighlights from "@/components/MarketHighlights";
import ReturnHintToast, { ReturnToDashboardToast } from "@/components/ReturnHintToast";
import LayoffsWidget from "@/components/LayoffsWidget";
import OfferCommunityWidget from "@/components/OfferCommunityWidget";
import StartupNewsList from "@/components/StartupNewsList";
import CompactVideoFeed from "@/components/CompactVideoFeed";
import { useAuthAwareHoldings } from "@/hooks/useAuthAwareHoldings";
import { QuoteData } from "@/hooks/usePortfolioSummary";
import { useExternalLink } from "@/hooks/useExternalLink";
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

interface HomeJobItem {
  title: string;
  category?: "layoff" | "hiring" | "discussion";
}

interface HomeOfferItem {
  title: string;
}

function HomeModuleFallback() {
  return <div className="min-h-16 rounded-sm bg-muted/20" />;
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

  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  const [marketNews, setMarketNews] = useState<MarketNewsItem[]>([]);
  const [layoffCount, setLayoffCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);
  const [activeWorkTab, setActiveWorkTab] = useState<"layoff" | "offer">("layoff");

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
        const [marketResp, jobsResp, offersResp] = await Promise.allSettled([
          fetch(`${config.apiBaseUrl}/api/market-news`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/community/jobs`, { signal: AbortSignal.timeout(10000) }),
          fetch(`${config.apiBaseUrl}/api/community/offers`, { signal: AbortSignal.timeout(10000) }),
        ]);

        if (marketResp.status === "fulfilled" && marketResp.value.ok) {
          const result = await marketResp.value.json();
          setMarketNews(result.items || []);
        } else {
          setMarketNews([]);
        }

        if (jobsResp.status === "fulfilled" && jobsResp.value.ok) {
          const result = await jobsResp.value.json();
          const items = result.items || [];
          setLayoffCount(items.filter((item: HomeJobItem) => item.category === "layoff").length);
        } else {
          setLayoffCount(0);
        }

        if (offersResp.status === "fulfilled" && offersResp.value.ok) {
          const result = await offersResp.value.json();
          const items: HomeOfferItem[] = result.items || [];
          setOfferCount(items.length);
        } else {
          setOfferCount(0);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch homepage feeds:", error);
        setMarketNews([]);
        setLayoffCount(0);
        setOfferCount(0);
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
                  {lang === "en" ? `Layoffs ${layoffCount}` : `裁员 ${layoffCount}`}
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
                  {lang === "en" ? `Offers ${offerCount}` : `Offer ${offerCount}`}
                </button>
              </div>
            </div>

            {activeWorkTab === "layoff" ? (
              <LayoffsWidget embedded />
            ) : (
              <OfferCommunityWidget maxItems={4} embedded />
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
