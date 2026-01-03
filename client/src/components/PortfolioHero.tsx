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
import { useMemo } from "react";

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
    
    movers.sort((a, b) => Math.abs(b.dailyChangeAmount) - Math.abs(a.dailyChangeAmount));
    return movers.slice(0, 3).map(m => m.ticker);
  }, [holdings, quotesData]);


  // Generate one-sentence market status
  const marketStatus = useMemo(() => {
    const explanation = generateMarketExplanation(portfolioMetrics.dailyChangePercent, topMoversTickers);
    if (explanation && explanation.explanations && explanation.explanations.length > 0) {
      return explanation.explanations[0]; // First sentence
    }
    return portfolioMetrics.dailyChangePercent >= 0 
      ? "今日市场表现良好" 
      : "今日市场有所回调";
  }, [portfolioMetrics.dailyChangePercent, topMoversTickers]);

  // Calculate top movers for compact chips display
  const topMovers = useMemo(() => {
    const movers: Array<{ ticker: string; dailyChangePercent: number }> = [];
    
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
          
          if (dailyChangePercent !== 0) {
            movers.push({
              ticker: tickerUpper,
              dailyChangePercent,
            });
          }
        }
      }
    });
    
    // Sort by absolute change percent, descending
    movers.sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent));
    
    // Return top 3 (will be filtered to 2-3 based on screen size)
    return movers.slice(0, 3);
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
    <div className="p-3 md:p-4 bg-card rounded-sm shadow-md border border-border/40">
      {/* Desktop: 3 columns grid, Mobile: vertical stack */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4">
        {/* Col1: 市值 + 今日盈亏（主视觉） */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-xs opacity-70 font-mono">市值</span>
            <span className="text-3xl md:text-4xl font-mono font-bold text-foreground leading-none tabular-nums">
              ${portfolioMetrics.portfolioValue.toLocaleString()}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            {portfolioMetrics.dailyChangeAmount >= 0 ? (
              <TrendingUp className="w-3 h-3 flex-shrink-0 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 flex-shrink-0 text-red-400" />
            )}
            <span
              className={`text-sm font-mono font-bold tabular-nums ${
                portfolioMetrics.dailyChangeAmount >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : ""}
              ${portfolioMetrics.dailyChangeAmount.toLocaleString()}
            </span>
            <span
              className={`text-sm font-mono font-semibold tabular-nums ${
                portfolioMetrics.dailyChangePercent >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              ({portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
              {portfolioMetrics.dailyChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Col2: Movers 竖排3行（ticker固定宽，pct右对齐） */}
        <div className="min-w-0">
          {topMovers.length > 0 ? (
            <div className="space-y-1">
              {topMovers.slice(0, 3).map((mover) => {
                const isPositive = mover.dailyChangePercent >= 0;
                return (
                  <div
                    key={mover.ticker}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="text-xs font-medium font-mono text-foreground w-12">
                      {mover.ticker}
                    </span>
                    <div className={`flex items-center gap-1 text-xs font-medium font-mono tabular-nums ${
                      isPositive ? "text-green-400" : "text-red-400"
                    }`}>
                      {isPositive ? (
                        <TrendingUp className="w-2.5 h-2.5" />
                      ) : (
                        <TrendingDown className="w-2.5 h-2.5" />
                      )}
                      <span className="text-right">
                        {isPositive ? "+" : ""}{mover.dailyChangePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs opacity-70 font-mono">暂无数据</div>
          )}
        </div>

        {/* Col3: 一句话市场状态 + 编辑仓位 */}
        <div className="min-w-0 flex flex-col justify-between">
          <div className="text-xs opacity-70 font-mono line-clamp-2 mb-2">
            {marketStatus}
          </div>
          <div className="flex-shrink-0">
            <HoldingsEditor trigger={
              <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
              </Button>
            } />
          </div>
        </div>
      </div>
    </div>
  );
}
