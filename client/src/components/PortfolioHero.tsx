/**
 * Portfolio Hero Component (Mobile-first compact)
 * Displays: 市值, 今日涨跌($ + %), 一句话市场状态, 编辑仓位 button
 */

import { TrendingUp, TrendingDown } from "lucide-react";
import { Holding } from "@/hooks/useHoldings";
import { usePortfolioSummary, QuoteData } from "@/hooks/usePortfolioSummary";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";
import HoldingsEditor from "@/components/HoldingsEditor";
import { generateMarketExplanation } from "@/lib/judgment";
import { useMemo, useState, useEffect } from "react";
import PortfolioSparkline from "@/components/PortfolioSparkline";
import { config } from "@/config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PortfolioHeroProps {
  quotesData: Record<string, QuoteData>;
  holdings: Holding[];
  holdingsLoaded: boolean;
  ytdBaseline: number | null;
  onYtdBaselineChange: (value: number | null) => void;
}

export default function PortfolioHero({
  quotesData,
  holdings,
  holdingsLoaded,
  ytdBaseline,
  onYtdBaselineChange,
}: PortfolioHeroProps) {
  // Mobile tab state for movers - must be called before any conditional returns
  const [mobileMoverTab, setMobileMoverTab] = useState<'positive' | 'negative'>('positive');
  
  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  // Fetch portfolio value series for sparkline
  const [valueSeries, setValueSeries] = useState<any>(null);
  
  useEffect(() => {
    if (!holdingsLoaded || holdings.length === 0) {
      setValueSeries(null);
      return;
    }

    const fetchValueSeries = async () => {
      try {
        // Encode holdings as JSON query parameter
        const holdingsParam = encodeURIComponent(JSON.stringify(
          holdings.map(h => ({ ticker: h.ticker, shares: Number(h.shares) }))
        ));
        const apiUrl = `${config.apiBaseUrl}/api/portfolio/value-series?range=1d&interval=5m&holdings=${holdingsParam}`;
        
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(10000),
        });
        
        if (!response.ok) {
          throw new Error(`Value series API error: ${response.status}`);
        }
        
        const result = await response.json();
        setValueSeries(result);
      } catch (error) {
        console.error('[PortfolioHero] Failed to fetch value series:', error);
        // Don't set to null - keep previous data if available
      }
    };

    fetchValueSeries();
    // Refresh every 5 minutes
    const interval = setInterval(fetchValueSeries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [holdings, holdingsLoaded, config.apiBaseUrl]);

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
    
    movers.sort((a, b) => Math.abs(b.dailyChangeAmount) - Math.abs(a.dailyChangeAmount));
    return movers.slice(0, 3).map(m => m.ticker);
  }, [holdings, quotesData]);


  // Format update time and data source status
  const updateInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    // For now, assume live data (can be enhanced to show actual source from API)
    return `更新 ${hours}:${minutes} · live`;
  }, []);

  // Calculate performance metrics (5D, 1M, YTD)
  const performanceMetrics = useMemo(() => {
    const currentValue = portfolioMetrics.portfolioValue;
    if (!currentValue || currentValue <= 0) {
      return {
        fiveDay: null,
        oneMonth: null,
        ytd: portfolioMetrics.ytdPercent,
      };
    }

    // Calculate 5D and 1M from value series if available
    let fiveDay: number | null = null;
    let oneMonth: number | null = null;

    if (valueSeries?.items && Array.isArray(valueSeries.items) && valueSeries.items.length > 0) {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Sort items by time (oldest first)
      const sortedItems = [...valueSeries.items]
        .map(item => ({
          t: item.t,
          v: typeof item.v === 'number' ? item.v : parseFloat(String(item.v)) || 0,
          time: new Date(item.t).getTime(),
        }))
        .filter(item => !isNaN(item.time) && item.v > 0)
        .sort((a, b) => a.time - b.time);

      if (sortedItems.length > 0) {
        // Find closest historical value for 5D (find the latest value before or at 5 days ago)
        const fiveDaysAgoTime = fiveDaysAgo.getTime();
        const fiveDayItem = sortedItems
          .filter(item => item.time <= fiveDaysAgoTime)
          .pop(); // Get the latest value before or at 5 days ago
        
        if (fiveDayItem && fiveDayItem.v > 0 && currentValue > 0) {
          fiveDay = ((currentValue / fiveDayItem.v) - 1) * 100;
        }

        // Find closest historical value for 1M (find the latest value before or at 1 month ago)
        const oneMonthAgoTime = oneMonthAgo.getTime();
        const oneMonthItem = sortedItems
          .filter(item => item.time <= oneMonthAgoTime)
          .pop(); // Get the latest value before or at 1 month ago
        
        if (oneMonthItem && oneMonthItem.v > 0 && currentValue > 0) {
          oneMonth = ((currentValue / oneMonthItem.v) - 1) * 100;
        }
      }
    }

    return {
      fiveDay: fiveDay !== null && !isNaN(fiveDay) ? Math.round(fiveDay * 100) / 100 : null,
      oneMonth: oneMonth !== null && !isNaN(oneMonth) ? Math.round(oneMonth * 100) / 100 : null,
      ytd: portfolioMetrics.ytdPercent,
    };
  }, [portfolioMetrics.portfolioValue, portfolioMetrics.ytdPercent, valueSeries]);

  // Calculate top movers: separate positive and negative
  const { topPositive, topNegative } = useMemo(() => {
    const positive: Array<{ ticker: string; dailyChangePercent: number }> = [];
    const negative: Array<{ ticker: string; dailyChangePercent: number }> = [];
    
    holdings.forEach((holding) => {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];
      const shares = Number(holding.shares);
      
      if (quote && quote.status === 'ok' && quote.price > 0 && !isNaN(shares) && shares > 0) {
        const price = Number(quote.price);
        const prevClose = quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;
        
        if (!isNaN(price) && price > 0) {
          let dailyChangePercent = 0;
          
          if (prevClose !== undefined && !isNaN(prevClose) && prevClose > 0) {
            dailyChangePercent = ((price - prevClose) / prevClose) * 100;
          } else if (quote.changePercent !== undefined) {
            dailyChangePercent = Number(quote.changePercent);
          }
          
          if (dailyChangePercent > 0) {
            positive.push({
              ticker: tickerUpper,
              dailyChangePercent,
            });
          } else if (dailyChangePercent < 0) {
            negative.push({
              ticker: tickerUpper,
              dailyChangePercent,
            });
          }
        }
      }
    });
    
    // Sort by absolute change percent, descending
    positive.sort((a, b) => b.dailyChangePercent - a.dailyChangePercent);
    negative.sort((a, b) => a.dailyChangePercent - b.dailyChangePercent);
    
    return {
      topPositive: positive.slice(0, 3),
      topNegative: negative.slice(0, 3),
    };
  }, [holdings, quotesData]);

  if (!holdingsLoaded) {
    return (
      <div className="p-3 bg-card rounded-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-sm shadow-md border border-border/40 h-full flex flex-col">
      {/* CardBody: 主栅格，高价值内容 */}
      <div className="p-4 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_0.6fr] gap-2 md:gap-4">
          {/* 左列: 市值 + 今日盈亏 + Sparkline */}
          <div className="min-w-0">
            {/* 市值（S级，单独一行） */}
            <div className="mb-1">
              <span className="text-[28px] md:text-[32px] font-mono font-semibold text-foreground leading-none tabular-nums">
                ${portfolioMetrics.portfolioValue.toLocaleString()}
              </span>
            </div>
            {/* Daily Change（M级，加粗，单独一行） */}
            <div className="flex items-baseline gap-0.5 mb-2">
              {portfolioMetrics.dailyChangeAmount >= 0 ? (
                <TrendingUp className="w-3 h-3 flex-shrink-0 text-green-500/70" />
              ) : (
                <TrendingDown className="w-3 h-3 flex-shrink-0 text-red-500/70" />
              )}
              <span
                className={`text-[14px] font-mono font-semibold tabular-nums ${
                  portfolioMetrics.dailyChangeAmount >= 0 ? "text-green-500/70" : "text-red-500/70"
                }`}
              >
                {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : ""}
                ${portfolioMetrics.dailyChangeAmount.toLocaleString()}
              </span>
              <span
                className={`text-[14px] font-mono font-semibold tabular-nums ${
                  portfolioMetrics.dailyChangePercent >= 0 ? "text-green-500/70" : "text-red-500/70"
                }`}
              >
                {portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                {portfolioMetrics.dailyChangePercent.toFixed(2)}%
              </span>
            </div>
            {/* Sparkline - 紧贴数字区域，减少下方空白 */}
            <div className="w-full -mx-2 md:-mx-3 mt-1">
              <PortfolioSparkline
                data={valueSeries}
                currentValue={portfolioMetrics.portfolioValue}
                dailyChangePercent={portfolioMetrics.dailyChangePercent}
                width={220}
                height={32}
              />
            </div>
          </div>

          {/* 中列: Top Movers - Top 3 ↑ / Top 3 ↓ */}
          <div className="min-w-0">
            {/* Mobile: Tab切换 */}
            <div className="md:hidden flex gap-1 mb-2 border-b border-border/30">
              <button
                onClick={() => setMobileMoverTab('positive')}
                className={`px-2 py-1 text-xs font-medium font-mono transition-colors ${
                  mobileMoverTab === 'positive'
                    ? 'text-foreground border-b-2 border-green-500/70'
                    : 'text-muted-foreground opacity-60'
                }`}
              >
                Top 3 ↑
              </button>
              <button
                onClick={() => setMobileMoverTab('negative')}
                className={`px-2 py-1 text-xs font-medium font-mono transition-colors ${
                  mobileMoverTab === 'negative'
                    ? 'text-foreground border-b-2 border-red-500/70'
                    : 'text-muted-foreground opacity-60'
                }`}
              >
                Top 3 ↓
              </button>
            </div>

            {/* Desktop: 两列并排（Top↑ / Top↓） */}
            <div className="hidden md:grid grid-cols-2 gap-3">
              {/* Positive column */}
              <div className="min-w-0">
                <div className="text-xs opacity-60 font-mono font-normal mb-1.5">Top 3 ↑</div>
                <div className="space-y-0.5" style={{ lineHeight: '1.35' }}>
                  {topPositive.length > 0 ? (
                    topPositive.map((mover) => (
                      <div
                        key={mover.ticker}
                        className="grid grid-cols-[48px_1fr] items-baseline gap-2"
                      >
                        <span className="text-[14px] font-medium font-mono text-foreground w-12">
                          {mover.ticker}
                        </span>
                        <div className="flex items-center gap-0 text-[14px] font-medium font-mono tabular-nums justify-end">
                          <TrendingUp className="w-2.5 h-2.5 mr-0.5 text-green-500/70" />
                          <span className="text-right text-green-500/70">+{mover.dailyChangePercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs opacity-60 font-mono font-normal">—</div>
                  )}
                </div>
              </div>

              {/* Negative column */}
              <div className="min-w-0">
                <div className="text-xs opacity-60 font-mono font-normal mb-1.5">Top 3 ↓</div>
                <div className="space-y-0.5" style={{ lineHeight: '1.35' }}>
                  {topNegative.length > 0 ? (
                    topNegative.map((mover) => (
                      <div
                        key={mover.ticker}
                        className="grid grid-cols-[48px_1fr] items-baseline gap-2"
                      >
                        <span className="text-[14px] font-medium font-mono text-foreground w-12">
                          {mover.ticker}
                        </span>
                        <div className="flex items-center gap-0 text-[14px] font-medium font-mono tabular-nums justify-end">
                          <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-red-500/70" />
                          <span className="text-right text-red-500/70">{mover.dailyChangePercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs opacity-60 font-mono font-normal">—</div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile: 单列显示（根据tab） */}
            <div className="md:hidden space-y-0.5" style={{ lineHeight: '1.35' }}>
              {(mobileMoverTab === 'positive' ? topPositive : topNegative).length > 0 ? (
                (mobileMoverTab === 'positive' ? topPositive : topNegative).map((mover) => {
                  const isPositive = mover.dailyChangePercent >= 0;
                  return (
                    <div
                      key={mover.ticker}
                      className="grid grid-cols-[48px_1fr] items-baseline gap-2"
                    >
                      <span className="text-[14px] font-medium font-mono text-foreground w-12">
                        {mover.ticker}
                      </span>
                      <div className="flex items-center gap-0 text-[14px] font-medium font-mono tabular-nums justify-end">
                        {isPositive ? (
                          <TrendingUp className="w-2.5 h-2.5 mr-0.5 text-green-500/70" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-red-500/70" />
                        )}
                        <span className={`text-right ${isPositive ? "text-green-500/70" : "text-red-500/70"}`}>
                          {isPositive ? "+" : ""}{mover.dailyChangePercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs opacity-60 font-mono font-normal">暂无数据</div>
              )}
            </div>

            {/* 更新时间（在 Top Movers 下方） */}
            <div className="mt-2 pt-1.5 border-t border-border/20">
              <div className="text-xs opacity-60 font-mono font-normal">
                {updateInfo}
              </div>
            </div>
          </div>

          {/* 右列: Performance（5D / 1M / YTD） */}
          <div className="min-w-0 flex flex-col">
            <div className="text-xs opacity-50 font-mono font-normal mb-1">Performance</div>
            <TooltipProvider>
              <div className="space-y-0.5" style={{ lineHeight: '1.4' }}>
                {/* 5D */}
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-2">
                  <span className="text-[14px] font-medium font-mono text-foreground w-8">
                    5D
                  </span>
                  <div className="text-[14px] font-medium font-mono tabular-nums text-right">
                    {performanceMetrics.fiveDay !== null ? (
                      <span className={performanceMetrics.fiveDay >= 0 ? "text-green-500/70" : "text-red-500/70"}>
                        {performanceMetrics.fiveDay >= 0 ? "+" : ""}
                        {performanceMetrics.fiveDay.toFixed(2)}%
                      </span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="opacity-60 cursor-help">N/A</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">数据不足（&lt;5 个交易日）</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* 1M */}
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-2">
                  <span className="text-xs font-medium font-mono text-foreground w-8">
                    1M
                  </span>
                  <div className="text-xs font-mono tabular-nums text-right">
                    {performanceMetrics.oneMonth !== null ? (
                      <span className={performanceMetrics.oneMonth >= 0 ? "text-green-500/80" : "text-red-500/80"}>
                        {performanceMetrics.oneMonth >= 0 ? "+" : ""}
                        {performanceMetrics.oneMonth.toFixed(2)}%
                      </span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="opacity-70 cursor-help">N/A</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">数据不足（&lt;5 个交易日）</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* YTD */}
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-2">
                  <span className="text-[14px] font-medium font-mono text-foreground w-8">
                    YTD
                  </span>
                  <div className="text-[14px] font-medium font-mono tabular-nums text-right">
                    {performanceMetrics.ytd !== null && performanceMetrics.ytd !== undefined ? (
                      <span className={performanceMetrics.ytd >= 0 ? "text-green-500/70" : "text-red-500/70"}>
                        {performanceMetrics.ytd >= 0 ? "+" : ""}
                        {performanceMetrics.ytd.toFixed(2)}%
                      </span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="opacity-60 cursor-help">N/A</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">数据不足</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            </TooltipProvider>
            
            {/* 编辑仓位按钮（与 Performance 纵向左对齐） */}
            <div className="mt-auto pt-2">
              <HoldingsEditor trigger={
                <Button variant="outline" size="sm" className="text-xs h-7 px-2 font-mono font-normal">
                  <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
                </Button>
              } />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
