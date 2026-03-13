import { Suspense, lazy, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import Navigation from "@/components/Navigation";
import PortfolioHero from "@/components/PortfolioHero";
import IndicesCard from "@/components/IndicesCard";
import MarketHighlights from "@/components/MarketHighlights";
import ReturnHintToast, { ReturnToDashboardToast } from "@/components/ReturnHintToast";
import LayoffsWidget from "@/components/LayoffsWidget";
import LeekCommunity from "@/components/LeekCommunity";
import { useAuthAwareHoldings } from "@/hooks/useAuthAwareHoldings";
import { QuoteData } from "@/hooks/usePortfolioSummary";
import { useExternalLink } from "@/hooks/useExternalLink";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

const FortuneWidget = lazy(() => import("@/components/FortuneWidget"));
const TodaySpendCarousels = lazy(() => import("@/components/TodaySpendCarousels"));

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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
  const [marketNews, setMarketNews] = useState<any[]>([]);

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
    async function loadHomeFeeds() {
      try {
        const response = await fetchWithTimeout(`${config.apiBaseUrl}/api/market-news`);
        if (response.ok) {
          const result = await response.json();
          setMarketNews(result.items || []);
        } else {
          setMarketNews([]);
        }
      } catch (error) {
        console.error("[Home] Failed to fetch market news:", error);
        setMarketNews([]);
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
          <motion.div className="mb-5 w-full min-w-0" variants={fadeInUp}>
            <Suspense fallback={<HomeModuleFallback />}>
              <FortuneWidget />
            </Suspense>
          </motion.div>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-market flex min-w-0 flex-col gap-4 rounded-[1.25rem] p-3 md:p-4"
            variants={fadeInUp}
          >
            <h2 className="text-lg font-semibold tracking-[0.01em] text-cyan-300/90">
              {t.home.sectionMarket}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[2.2fr_1fr]">
              <div className="min-w-0 self-start">
                <PortfolioHero
                  quotesData={quotesData}
                  holdings={holdings}
                  holdingsLoaded={holdingsLoaded}
                  ytdBaseline={ytdBaseline}
                  onYtdBaselineChange={updateYtdBaseline}
                />
              </div>
              <div className="min-w-0 self-start">
                <IndicesCard />
              </div>
            </div>

            <div className="w-full min-w-0">
              <MarketHighlights marketNews={marketNews} />
            </div>

          </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-work flex min-w-0 flex-col gap-4 rounded-[1.25rem] p-3 md:p-4"
            variants={fadeInUp}
            >
              <h2 className="text-lg font-semibold tracking-[0.01em] text-sky-300/90">
                {t.home.sectionWork}
              </h2>

              <div className="grid w-full min-w-0 gap-4 xl:grid-cols-2">
                <div className="min-w-0">
                  <h3 className="mb-3 text-sm font-semibold text-foreground/88">裁员新闻</h3>
                  <LayoffsWidget />
                </div>
                <div className="min-w-0">
                  <h3 className="mb-3 text-sm font-semibold text-foreground/88">一亩三分地包裹帖</h3>
                  <LeekCommunity hideTitle maxItems={5} />
                </div>
              </div>

            </motion.section>

          <div className="section-divider" />

          <motion.section
            className="section-shell section-shell-food flex min-w-0 flex-col gap-4 rounded-[1.25rem] p-3 md:p-4"
            variants={fadeInUp}
          >
            <h2 className="text-lg font-semibold tracking-[0.01em] text-amber-300/90">
              {t.home.sectionFood}
            </h2>

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




