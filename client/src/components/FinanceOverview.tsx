/**
 * Data Punk Design: Financial terminal-style overview with REAL-TIME data from Google CSE
 * - Large monospace numbers with neon glow
 * - Green for gains, red for losses
 * - Grid layout for indices
 * - Live data from serverless API (/api/market)
 */

import { useEffect, useState, useMemo } from "react";
import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { generateMarketJudgment, type MarketJudgment } from "@/lib/judgment";
import { config } from "@/config";
import DataStateBadge from "@/components/DataStateBadge";
import SourceLink from "@/components/SourceLink";
import { getSourceInfo, getStatus, getNumericValue } from "@shared/utils";
import { useHoldings } from "@/hooks/useHoldings";
import PortfolioSummary from "@/components/PortfolioSummary";
import TopMovers from "@/components/TopMovers";
import MarketExplanation from "@/components/MarketExplanation";
import { usePortfolioSummary } from "@/hooks/usePortfolioSummary";

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  // New standard fields (preferred)
  status?: "ok" | "stale" | "unavailable";
  asOf?: string;
  source?: {
    name: string;
    url: string;
  };
  ttlSeconds?: number;
  error?: string;
  // Legacy fields (for backward compatibility)
  source_name?: string;
  source_url?: string;
  as_of?: string;
}

// FinanceData interface removed - calculations now handled by PortfolioSummary and TopMovers components

interface FinanceOverviewProps {
  compactMode?: boolean;
  showMarketTemperatureOnly?: boolean;
  showTopMoversOnly?: boolean;
}

export default function FinanceOverview({ 
  compactMode = false, 
  showMarketTemperatureOnly = false,
  showTopMoversOnly = false 
}: FinanceOverviewProps = {}) {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
    mortgage: MarketDataItem;
    powerball: MarketDataItem;
  } | null>(null);
  const [judgment, setJudgment] = useState<MarketJudgment | null>(null);
  const [loading, setLoading] = useState(true);
  const { holdings, isLoaded: holdingsLoaded, ytdBaseline, updateYtdBaseline } = useHoldings();

  // Fetch market data (separate from holdings calculation)
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch market data from serverless API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const apiUrl = `${config.apiBaseUrl}/api/market`;
        console.log('[FinanceOverview] Fetching market data from:', apiUrl);
        
        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        const data: {
          spy: MarketDataItem;
          gold: MarketDataItem;
          btc: MarketDataItem;
          mortgage: MarketDataItem;
          powerball: MarketDataItem;
        } = result.data;
        
        // Debug: Log change data
        console.log('[FinanceOverview] Market data received:', {
          spy: { value: data.spy.value, change: data.spy.change, change_percent: data.spy.change_percent },
          gold: { value: data.gold.value, change: data.gold.change, change_percent: data.gold.change_percent },
          btc: { value: data.btc.value, change: data.btc.change, change_percent: data.btc.change_percent },
        });
        
        setMarketData(data);
        
        // Generate market judgment (only if SPY is available)
        const spyStatus = getStatus(data.spy);
        const spyChangePercent = spyStatus === "ok" ? (data.spy.change_percent || 0) : 0;
        const marketJudgment = spyStatus === "ok" ? generateMarketJudgment({
          spyChangePercent: data.spy.change_percent || 0,
          portfolioChangePercent: spyChangePercent, // Will be updated by useMemo
          btcChangePercent: getStatus(data.btc) === "ok" ? (data.btc.change_percent || 0) : 0,
          goldChangePercent: getStatus(data.gold) === "ok" ? (data.gold.change_percent || 0) : 0,
        }) : null;
        setJudgment(marketJudgment);
        console.log('[FinanceOverview] Market data loaded successfully');
      } catch (error) {
        console.error("[FinanceOverview] Failed to fetch finance overview:", error);
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            console.error("[FinanceOverview] Request timeout - backend server may not be running");
          } else {
            console.error("[FinanceOverview] Error details:", error.message);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // Refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // Only fetch market data, not dependent on holdings

  // Fetch quotes for holdings
  const [quotesData, setQuotesData] = useState<Record<string, { price: number; prevClose?: number; change?: number; changePercent?: number; status: string }>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);

  // Force recalculation when holdings change by using a version counter
  const [holdingsVersion, setHoldingsVersion] = useState(0);
  
  useEffect(() => {
    if (holdingsLoaded) {
      console.log('[FinanceOverview] Holdings changed, incrementing version:', holdings.length);
      setHoldingsVersion(v => v + 1);
    }
  }, [holdings, holdingsLoaded]);

  // Fetch quotes when holdings change
  useEffect(() => {
    if (!holdingsLoaded || holdings.length === 0) {
      setQuotesData({});
      return;
    }

    const fetchQuotes = async () => {
      setQuotesLoading(true);
      try {
        const tickers = holdings.map(h => h.ticker.toUpperCase()).join(',');
        const apiUrl = `${config.apiBaseUrl}/api/quotes?tickers=${encodeURIComponent(tickers)}`;
        console.log('[FinanceOverview] Fetching quotes for:', tickers);
        
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
        });
        
        if (!response.ok) {
          throw new Error(`Quotes API error: ${response.status}`);
        }
        
        const result = await response.json();
        const quotes: Array<{
          ticker: string;
          status: 'ok' | 'stale' | 'unavailable';
          price: number;
          prevClose?: number;
          change?: number;
          changePercent?: number;
          error?: string;
        }> = result.quotes || [];
        
        // Convert to map for easy lookup with strict type checking
        const quotesMap: Record<string, { price: number; prevClose?: number; change?: number; changePercent?: number; status: string }> = {};
        quotes.forEach(quote => {
          // Ensure all numeric values are properly converted to numbers
          const price = Number(quote.price);
          const prevClose = quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;
          const change = quote.change !== undefined ? Number(quote.change) : undefined;
          const changePercent = quote.changePercent !== undefined ? Number(quote.changePercent) : undefined;
          
          if (isNaN(price) || price <= 0) {
            console.warn('[FinanceOverview] Invalid price for', quote.ticker, ':', quote.price);
            return;
          }
          
          quotesMap[quote.ticker.toUpperCase()] = {
            price,
            prevClose,
            change,
            changePercent,
            status: quote.status,
          };
        });
        
        setQuotesData(quotesMap);
        console.log('[FinanceOverview] Quotes fetched:', Object.keys(quotesMap).length, 'tickers');
      } catch (error) {
        console.error('[FinanceOverview] Failed to fetch quotes:', error);
        setQuotesData({});
      } finally {
        setQuotesLoading(false);
      }
    };

    fetchQuotes();
  }, [holdings, holdingsLoaded, config.apiBaseUrl]);

  // Portfolio calculations are now handled by PortfolioSummary and TopMovers components
  // Calculate portfolio metrics for market explanation
  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);
  
  // Calculate top movers tickers for market explanation
  const topMoversTickers = useMemo(() => {
    const movers: Array<{ ticker: string; dailyChangeAmount: number }> = [];
    
    holdings.forEach((holding) => {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];
      const shares = Number(holding.shares);
      
      if (quote && quote.status === 'ok' && quote.price > 0 && !isNaN(shares) && shares > 0) {
        const price = Number(quote.price);
        const prevClose = quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;
        
        if (!isNaN(price) && price > 0) {
          let dailyChangeAmount = 0;
          
          if (prevClose !== undefined && !isNaN(prevClose) && prevClose > 0) {
            const priceChange = price - prevClose;
            dailyChangeAmount = shares * priceChange;
          } else if (quote.change !== undefined) {
            const change = Number(quote.change);
            if (!isNaN(change)) {
              dailyChangeAmount = shares * change;
            }
          }
          
          if (dailyChangeAmount !== 0) {
            movers.push({
              ticker: tickerUpper,
              dailyChangeAmount,
            });
          }
        }
      }
    });
    
    // Sort by absolute daily change amount, descending
    movers.sort((a, b) => Math.abs(b.dailyChangeAmount) - Math.abs(a.dailyChangeAmount));
    
    // Return top 3 tickers
    return movers.slice(0, 3).map(m => m.ticker);
  }, [holdings, quotesData]);

  // Prepare indices data (only SPY, GOLD, BTC) - need this for compactMode market temperature
  const indices = marketData ? [
    {
      code: "SPY",
      name: "S&P 500 ETF",
      value: getStatus(marketData.spy) === "ok" ? getNumericValue(marketData.spy) : "Unavailable",
      change: getStatus(marketData.spy) === "ok" && marketData.spy.change !== undefined && !isNaN(Number(marketData.spy.change)) ? Number(marketData.spy.change) : undefined,
      changePercent: getStatus(marketData.spy) === "ok" && marketData.spy.change_percent !== undefined && !isNaN(Number(marketData.spy.change_percent)) ? Number(marketData.spy.change_percent) : undefined,
      status: getStatus(marketData.spy),
      source: getSourceInfo(marketData.spy).name,
      sourceUrl: getSourceInfo(marketData.spy).url,
      error: marketData.spy.error,
    },
    {
      code: "GOLD",
      name: "Gold",
      value: getStatus(marketData.gold) === "ok" ? getNumericValue(marketData.gold) : "Unavailable",
      change: getStatus(marketData.gold) === "ok" && marketData.gold.change !== undefined && !isNaN(Number(marketData.gold.change)) ? Number(marketData.gold.change) : undefined,
      changePercent: getStatus(marketData.gold) === "ok" && marketData.gold.change_percent !== undefined && !isNaN(Number(marketData.gold.change_percent)) ? Number(marketData.gold.change_percent) : undefined,
      status: getStatus(marketData.gold),
      source: getSourceInfo(marketData.gold).name,
      sourceUrl: getSourceInfo(marketData.gold).url,
      error: marketData.gold.error,
    },
    {
      code: "BTC",
      name: "Bitcoin",
      value: getStatus(marketData.btc) === "ok" ? getNumericValue(marketData.btc) : "Unavailable",
      change: getStatus(marketData.btc) === "ok" ? Number(marketData.btc.change || 0) : 0,
      changePercent: getStatus(marketData.btc) === "ok" ? Number(marketData.btc.change_percent || 0) : 0,
      status: getStatus(marketData.btc),
      source: getSourceInfo(marketData.btc).name,
      sourceUrl: getSourceInfo(marketData.btc).url,
      error: marketData.btc.error,
    },
  ] : [];

  // If compactMode and showMarketTemperatureOnly, return only market temperature
  if (compactMode && showMarketTemperatureOnly) {
    if (loading || !marketData || indices.length === 0) {
      return (
        <div className="rounded-sm p-2 bg-card border border-border/50">
          <div className="text-xs text-muted-foreground text-center py-2">
            {loading ? "加载中..." : "暂无数据"}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-sm p-2 bg-card border border-border/50 w-full h-auto">
        <div className="space-y-1">
          {indices.map((index) => {
          const isUnavailable = index.status === "unavailable";
          const isOk = index.status === "ok";
          
          return (
            <div
              key={index.code}
              className={`flex items-center justify-between py-0.5 ${
                isUnavailable ? "opacity-75" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono text-muted-foreground w-10">
                  {index.code}
                </div>
                {isUnavailable ? (
                  <div className="text-xs font-mono text-muted-foreground">
                    不可用
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-mono font-bold text-foreground">
                      {typeof index.value === "number"
                        ? index.value.toLocaleString()
                        : index.value}
                    </div>
                    {isOk && (index.change !== undefined || index.changePercent !== undefined) && (
                      <div
                        className={`text-xs font-mono flex items-center gap-0.5 ${
                          (index.changePercent !== undefined && Number(index.changePercent) >= 0) || 
                          (index.change !== undefined && Number(index.change) >= 0) ||
                          (index.changePercent === undefined && index.change === undefined)
                            ? "text-green-400" 
                            : "text-red-400"
                        }`}
                      >
                        {(index.changePercent !== undefined && Number(index.changePercent) !== 0) ? (
                          Number(index.changePercent) >= 0 ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )
                        ) : (index.change !== undefined && Number(index.change) !== 0) ? (
                          Number(index.change) >= 0 ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )
                        ) : null}
                        {index.change !== undefined && !isNaN(Number(index.change)) && Number(index.change) !== 0 && (
                          <>
                            {Number(index.change) >= 0 ? "+" : ""}
                            {typeof index.change === 'number' ? index.change.toFixed(2) : index.change}
                          </>
                        )}
                        {index.changePercent !== undefined && !isNaN(Number(index.changePercent)) && Number(index.changePercent) !== 0 && (
                          <span className={index.change !== undefined && Number(index.change) !== 0 ? "ml-0.5" : ""}>
                            ({Number(index.changePercent) >= 0 ? "+" : ""}{Number(index.changePercent).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    );
  }

  // If compactMode and showTopMoversOnly, return only top movers
  if (compactMode && showTopMoversOnly) {
    return holdingsLoaded && holdings.length > 0 ? (
      <TopMovers quotesData={quotesData} holdings={holdings} />
    ) : null;
  }

  // If compactMode, return only PortfolioSummary (for ROW 1)
  if (compactMode) {
    return holdingsLoaded ? (
      <PortfolioSummary
        quotesData={quotesData}
        holdings={holdings}
        holdingsLoaded={holdingsLoaded}
        ytdBaseline={ytdBaseline}
        onYtdBaselineChange={updateYtdBaseline}
      />
    ) : null;
  }

  // Full mode (original layout)
  return (
    <div className="space-y-4">
      {/* A) Portfolio Summary */}
      {holdingsLoaded && (
        <PortfolioSummary
          quotesData={quotesData}
          holdings={holdings}
          holdingsLoaded={holdingsLoaded}
          ytdBaseline={ytdBaseline}
          onYtdBaselineChange={updateYtdBaseline}
        />
      )}

      {/* B) Top 3 Movers */}
      {holdingsLoaded && holdings.length > 0 && (
        <TopMovers quotesData={quotesData} holdings={holdings} />
      )}

      {/* D) Market Explanation - Max 3 bullets */}
      {holdingsLoaded && holdings.length > 0 && (
        <MarketExplanation 
          dailyPct={portfolioMetrics.dailyChangePercent}
          topMovers={topMoversTickers}
        />
      )}

      {/* C) Market Temperature (SPY, GOLD, BTC combined) */}
      <div className="glow-border rounded-sm p-4 bg-card">
        <h3 className="text-base font-semibold font-mono mb-3 text-foreground/90">
          市场温度
        </h3>
        <div className="space-y-3">
          {indices.map((index) => {
          const isUnavailable = index.status === "unavailable";
          const isStale = index.status === "stale";
          const isOk = index.status === "ok";
          
          return (
            <div
              key={index.code}
              className={`flex items-center justify-between py-2 border-b border-border/50 last:border-0 ${
                isUnavailable ? "opacity-75" : ""
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs font-mono text-muted-foreground">
                    {index.code}
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {index.name}
                  </div>
                  <DataStateBadge status={index.status} />
                </div>
                
                {/* Value display - compact */}
                {isUnavailable ? (
                  <div className="text-sm font-mono text-muted-foreground">
                    不可用
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-base font-mono font-bold text-foreground">
                      {typeof index.value === "number"
                        ? index.value.toLocaleString()
                        : index.value}
                    </div>
                    {isOk && index.change !== undefined && index.change !== 0 && !isNaN(Number(index.change)) && (
                      <div
                        className={`text-xs font-mono flex items-center gap-1 ${
                          Number(index.change) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {Number(index.change) >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {Number(index.change) >= 0 ? "+" : ""}
                        {typeof index.change === 'number' ? index.change.toFixed(2) : index.change} {index.changePercent !== undefined && !isNaN(Number(index.changePercent)) ? `(${Number(index.changePercent) >= 0 ? "+" : ""}${Number(index.changePercent).toFixed(2)}%)` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
