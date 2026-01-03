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
    <div className="p-2.5 bg-card rounded-sm">
      <div className="flex items-center justify-between gap-2">
        {/* Left: 市值 + 今日涨跌 + 一句话市场状态 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className="text-muted-foreground text-xs font-mono">市值</span>
            <span className="text-lg font-mono font-bold text-foreground">
              ${portfolioMetrics.portfolioValue.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            {portfolioMetrics.dailyChangeAmount >= 0 ? (
              <TrendingUp className="w-3 h-3 flex-shrink-0 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 flex-shrink-0 text-red-400" />
            )}
            <span
              className={`text-sm font-mono font-bold ${
                portfolioMetrics.dailyChangeAmount >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : ""}
              ${portfolioMetrics.dailyChangeAmount.toLocaleString()}
            </span>
            <span
              className={`text-xs font-mono ${
                portfolioMetrics.dailyChangePercent >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              ({portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
              {portfolioMetrics.dailyChangePercent.toFixed(2)}%)
            </span>
          </div>
          {/* 一句话市场状态 */}
          <div className="text-xs text-muted-foreground font-mono line-clamp-1">
            {marketStatus}
          </div>
        </div>

        {/* Right: 编辑仓位 button */}
        <div className="flex-shrink-0">
          <HoldingsEditor trigger={
            <Button variant="outline" size="sm" className="text-xs h-7 px-2">
              <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
            </Button>
          } />
        </div>
      </div>
    </div>
  );
}
