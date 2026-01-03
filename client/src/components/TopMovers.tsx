/**
 * Top 3 Movers Component (B)
 * Displays top 3 holdings by absolute daily change
 */

import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Holding } from "@/hooks/useHoldings";

interface QuoteData {
  price: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  status: string;
}

interface TopMoversProps {
  quotesData: Record<string, QuoteData>;
  holdings: Holding[];
}

interface MoverData {
  ticker: string;
  dailyChangeAmount: number;
  dailyChangePercent: number;
}

export default function TopMovers({ quotesData, holdings }: TopMoversProps) {
  const topMovers = useMemo(() => {
    const movers: MoverData[] = [];

    holdings.forEach((holding) => {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];
      const shares = Number(holding.shares);

      if (quote && quote.status === 'ok' && quote.price > 0 && !isNaN(shares) && shares > 0) {
        const price = Number(quote.price);
        const prevClose = quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;

        if (!isNaN(price) && price > 0) {
          let dailyChangeAmount = 0;
          let dailyChangePercent = 0;

          // Calculate daily change: shares * (price - prevClose)
          if (prevClose !== undefined && !isNaN(prevClose) && prevClose > 0) {
            const priceChange = price - prevClose;
            dailyChangeAmount = shares * priceChange;
            dailyChangePercent = ((price - prevClose) / prevClose) * 100;
          } else if (quote.change !== undefined) {
            const change = Number(quote.change);
            if (!isNaN(change)) {
              dailyChangeAmount = shares * change;
              if (quote.changePercent !== undefined) {
                dailyChangePercent = Number(quote.changePercent);
              }
            }
          }

          // Only include if we have valid change data
          if (dailyChangeAmount !== 0 || dailyChangePercent !== 0) {
            movers.push({
              ticker: tickerUpper,
              dailyChangeAmount,
              dailyChangePercent,
            });
          }
        }
      }
    });

    // Sort by absolute daily change amount, descending
    movers.sort((a, b) => Math.abs(b.dailyChangeAmount) - Math.abs(a.dailyChangeAmount));

    // Return top 3
    return movers.slice(0, 3);
  }, [holdings, quotesData]);

  if (topMovers.length === 0) {
    return (
      <div className="rounded-sm p-2 bg-card border border-border/50">
        <div className="text-muted-foreground text-xs text-center py-2">暂无涨跌数据</div>
      </div>
    );
  }

  return (
    <div className="rounded-sm p-2 bg-card border border-border/50 w-full h-auto">
      <div className="space-y-1.5">
        {topMovers.map((mover) => {
          const isPositive = mover.dailyChangeAmount >= 0;
          return (
            <div
              key={mover.ticker}
              className="flex items-center justify-between py-1"
            >
              <div className="font-mono font-bold text-sm">{mover.ticker}</div>
              <div className={`flex items-center gap-1 font-mono text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}>
                {isPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span className="font-bold">
                  {isPositive ? "+" : ""}${mover.dailyChangeAmount.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
