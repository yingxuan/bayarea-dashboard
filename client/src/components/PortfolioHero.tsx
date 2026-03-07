/**
 * Portfolio Hero Component (Mobile-first compact)
 * Displays: 市值, 今日涨跌($ + %), 一句话市场状态, 编辑仓位 button
 */

import { TrendingUp, TrendingDown, SlidersHorizontal } from "lucide-react";
import { Holding } from "@/hooks/useHoldings";
import { usePortfolioSummary, QuoteData } from "@/hooks/usePortfolioSummary";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";
import HoldingsEditor from "@/components/HoldingsEditor";
import { useMemo, useState, useEffect } from "react";
import PortfolioSparkline from "@/components/PortfolioSparkline";
import { config } from "@/config";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const [ytdDialogOpen, setYtdDialogOpen] = useState(false);
  const [ytdInputValue, setYtdInputValue] = useState(ytdBaseline?.toString() || "");
  const [ytdInputError, setYtdInputError] = useState<string | null>(null);
  const [valueSeries, setValueSeries] = useState<any>(null);

  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  useEffect(() => {
    if (!ytdDialogOpen) {
      setYtdInputValue(ytdBaseline?.toString() || "");
      setYtdInputError(null);
    }
  }, [ytdBaseline, ytdDialogOpen]);

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

  // Handler function (not a hook)
  const handleYtdSave = () => {
    const parsed = parseFloat(ytdInputValue);
    if (!isNaN(parsed) && parsed > 0) {
      onYtdBaselineChange(parsed);
      setYtdDialogOpen(false);
    } else {
      setYtdInputError("请输入有效数字（大于 0）");
    }
  };

  const renderMoverColumn = (
    title: string,
    movers: Array<{ ticker: string; dailyChangePercent: number }>,
    isPositive: boolean
  ) => (
    <div className="min-w-0">
      <div className="text-xs font-mono font-normal mb-1 uppercase tracking-wide text-foreground/70">
        {title}
      </div>
      <div className="space-y-0.5" style={{ lineHeight: '1.35' }}>
        {movers.length > 0 ? (
          movers.map((mover) => (
            <div
              key={mover.ticker}
              className="grid grid-cols-[48px_1fr] items-baseline gap-2"
            >
              <span className="text-[14px] font-medium font-mono text-foreground w-12">
                {mover.ticker}
              </span>
              <div className="flex items-baseline gap-0 text-[14px] font-medium font-mono tabular-nums justify-end">
                {isPositive ? (
                  <TrendingUp className="w-2.5 h-2.5 mr-0.5 text-green-500/70 flex-shrink-0" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-red-500/70 flex-shrink-0" />
                )}
                <span className={`text-right ${isPositive ? "text-green-500/70" : "text-red-500/70"}`}>
                  {mover.dailyChangePercent >= 0 ? "+" : ""}
                  {mover.dailyChangePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-xs opacity-60 font-mono font-normal">—</div>
        )}
      </div>
    </div>
  );

  // NOW WE CAN DO EARLY RETURNS (after all hooks are called)

  if (!holdingsLoaded) {
    return (
      <div className="p-3 bg-card rounded-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="bg-card rounded-sm shadow-md border border-border/40 h-full flex flex-col items-center justify-center p-6 text-center min-h-[120px]">
        <div className="text-muted-foreground text-sm mb-3">还没有持仓记录</div>
        <HoldingsEditor
          trigger={
            <Button variant="outline" size="sm" className="text-xs h-7 px-3 font-mono font-normal">
              <PencilIcon className="w-3 h-3 mr-1" /> 点击添加持仓
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-sm shadow-md border border-border/40 h-full flex flex-col">
      {/* CardBody: 主栅格，高价值内容 */}
      <div className="p-4 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-2 md:gap-4">
          {/* 左列: 市值 + 今日盈亏 + Sparkline */}
          <div className="min-w-0 flex flex-col">
            {/* 市值（S级，单独一行） */}
            <div className="mb-0.5">
              <span className="text-[28px] md:text-[32px] font-mono font-semibold text-foreground leading-[1.1] tabular-nums">
                ${portfolioMetrics.portfolioValue.toLocaleString()}
              </span>
            </div>
            {/* Daily Change（M级，加粗，单独一行） */}
            <div className="space-y-1 mb-1.5">
              {/* 今日：% 优先，$ 次要 */}
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-muted-foreground">今日</span>
                <span
                  className={`text-[14px] font-medium font-mono tabular-nums ${
                    portfolioMetrics.dailyChangePercent >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                  {portfolioMetrics.dailyChangePercent.toFixed(2)}%
                </span>
                <span
                  className={`text-xs font-mono tabular-nums opacity-60 ${
                    portfolioMetrics.dailyChangePercent >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : "-"}
                  ${Math.abs(portfolioMetrics.dailyChangeAmount).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              {/* 年内：整体降权 */}
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-muted-foreground/50">年内</span>
                {portfolioMetrics.ytdChangeAmount !== null && portfolioMetrics.ytdPercent !== null ? (
                  <>
                    <span
                      className={`text-xs font-mono tabular-nums opacity-70 ${
                        portfolioMetrics.ytdPercent >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                      {portfolioMetrics.ytdPercent.toFixed(2)}%
                    </span>
                    <span
                      className={`text-[11px] font-mono tabular-nums opacity-50 ${
                        portfolioMetrics.ytdPercent >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {portfolioMetrics.ytdChangeAmount >= 0 ? "+" : "-"}
                      ${Math.abs(portfolioMetrics.ytdChangeAmount).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </>
                ) : (
                  <span className="text-xs opacity-40 font-mono">未配置</span>
                )}
              </div>
            </div>
            {/* Sparkline - 全宽填充 */}
            <div className="w-full mt-1">
              <PortfolioSparkline
                data={valueSeries}
                currentValue={portfolioMetrics.portfolioValue}
                dailyChangePercent={portfolioMetrics.dailyChangePercent}
                width={220}
                height={32}
              />
            </div>
          </div>

          {/* 中列: Top Movers */}
          <div className="min-w-0 flex flex-col space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {renderMoverColumn("Top 3 ↑", topPositive, true)}
              {renderMoverColumn("Top 3 ↓", topNegative, false)}
            </div>
            <div className="mt-2 pt-1.5 border-t border-border/20">
              <div className="text-xs opacity-60 font-mono font-normal">{updateInfo}</div>
            </div>
            <div className="flex justify-end items-center gap-2 mt-auto">
              <button
                type="button"
                onClick={() => setYtdDialogOpen(true)}
                className="text-xs h-7 px-2 font-mono font-normal flex items-center gap-1 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors"
                title="设置年初基准"
              >
                <SlidersHorizontal className="w-3 h-3" /> YTD基准
              </button>
              <HoldingsEditor
                trigger={
                  <Button variant="outline" size="sm" className="text-xs h-7 px-2 font-mono font-normal">
                    <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
      <Dialog open={ytdDialogOpen} onOpenChange={(open) => setYtdDialogOpen(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置年初基准</DialogTitle>
          <DialogDescription>输入您期望的 YTD 起始市值（美元）。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            type="number"
            placeholder="e.g. 5400000"
            value={ytdInputValue}
            onChange={(e) => setYtdInputValue(e.target.value)}
          />
          {ytdInputError && (
            <p className="text-xs text-destructive">{ytdInputError}</p>
          )}
        </div>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setYtdDialogOpen(false)}>
            取消
          </Button>
          <Button onClick={handleYtdSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
