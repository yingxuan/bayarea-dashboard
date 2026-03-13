import { useEffect, useMemo, useState } from "react";
import { PencilIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Holding } from "@/hooks/useHoldings";
import { QuoteData, usePortfolioSummary } from "@/hooks/usePortfolioSummary";
import { Button } from "@/components/ui/button";
import HoldingsEditor from "@/components/HoldingsEditor";
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
        const holdingsParam = encodeURIComponent(
          JSON.stringify(holdings.map((h) => ({ ticker: h.ticker, shares: Number(h.shares) }))),
        );
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
        console.error("[PortfolioHero] Failed to fetch value series:", error);
      }
    };

    fetchValueSeries();
    const interval = setInterval(fetchValueSeries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [holdings, holdingsLoaded]);

  const updateInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `更新 ${hours}:${minutes} · live`;
  }, []);

  const { topPositive, topNegative } = useMemo(() => {
    const positive: Array<{ ticker: string; dailyChangePercent: number }> = [];
    const negative: Array<{ ticker: string; dailyChangePercent: number }> = [];

    holdings.forEach((holding) => {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];
      const shares = Number(holding.shares);

      if (quote && quote.status === "ok" && quote.price > 0 && !isNaN(shares) && shares > 0) {
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
            positive.push({ ticker: tickerUpper, dailyChangePercent });
          } else if (dailyChangePercent < 0) {
            negative.push({ ticker: tickerUpper, dailyChangePercent });
          }
        }
      }
    });

    positive.sort((a, b) => b.dailyChangePercent - a.dailyChangePercent);
    negative.sort((a, b) => a.dailyChangePercent - b.dailyChangePercent);

    return {
      topPositive: positive.slice(0, 3),
      topNegative: negative.slice(0, 3),
    };
  }, [holdings, quotesData]);

  const hasRenderableSeries = useMemo(() => {
    const items = valueSeries?.items;
    if (!Array.isArray(items) || items.length < 2) return false;
    return items.every(
      (p: any) =>
        p &&
        typeof p.v === "number" &&
        Number.isFinite(p.v) &&
        typeof p.t === "string" &&
        p.t.length > 0,
    );
  }, [valueSeries]);

  const handleYtdSave = () => {
    const parsed = parseFloat(ytdInputValue);
    if (!isNaN(parsed) && parsed > 0) {
      onYtdBaselineChange(parsed);
      setYtdDialogOpen(false);
    } else {
      setYtdInputError("请输入大于 0 的有效数字");
    }
  };

  const renderMoverColumn = (
    title: string,
    movers: Array<{ ticker: string; dailyChangePercent: number }>,
    isPositive: boolean,
  ) => (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/75">
        {title}
      </div>
      <div className="space-y-1.5">
        {movers.length > 0 ? (
          movers.map((mover) => (
            <div key={mover.ticker} className="grid grid-cols-[48px_1fr] items-baseline gap-2">
              <span className="w-12 text-[13px] font-medium text-foreground">{mover.ticker}</span>
              <div className="flex items-baseline justify-end gap-0 text-[13px] font-medium tabular-nums">
                {isPositive ? (
                  <TrendingUp className="mr-0.5 h-3 w-3 shrink-0 text-emerald-400/80" />
                ) : (
                  <TrendingDown className="mr-0.5 h-3 w-3 shrink-0 text-rose-400/80" />
                )}
                <span className={isPositive ? "text-emerald-400/85" : "text-rose-400/85"}>
                  {mover.dailyChangePercent >= 0 ? "+" : ""}
                  {mover.dailyChangePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-xs text-muted-foreground/55">暂无</div>
        )}
      </div>
    </div>
  );

  if (!holdingsLoaded) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
        <div className="animate-pulse">
          <div className="h-6 w-1/2 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/6 p-6 text-center">
        <div className="mb-3 text-sm text-muted-foreground">还没有持仓记录</div>
        <HoldingsEditor
          trigger={
            <Button variant="outline" size="sm" className="h-9 rounded-full px-4 text-xs font-medium">
              <PencilIcon className="mr-1 h-3 w-3" /> 添加持仓
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="hero-panel rounded-[1.2rem] p-3 md:p-4">
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="min-w-0">
            <div className="mb-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-foreground md:text-[38px]">
              ${portfolioMetrics.portfolioValue.toLocaleString()}
            </div>

            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground">今日</span>
              <span
                className={`text-[15px] font-medium tabular-nums ${
                  portfolioMetrics.dailyChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                {portfolioMetrics.dailyChangePercent.toFixed(2)}%
              </span>
              <span
                className={`text-xs tabular-nums opacity-70 ${
                  portfolioMetrics.dailyChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : "-"}$
                {Math.abs(portfolioMetrics.dailyChangeAmount).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="text-xs text-muted-foreground/60">年内</span>
              {portfolioMetrics.ytdChangeAmount !== null && portfolioMetrics.ytdPercent !== null ? (
                <span
                  className={`text-xs tabular-nums ${
                    portfolioMetrics.ytdPercent >= 0 ? "text-emerald-400/90" : "text-rose-400/90"
                  }`}
                >
                  {portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                  {portfolioMetrics.ytdPercent.toFixed(2)}%
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/45">未配置</span>
              )}
            </div>
            {hasRenderableSeries ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <PortfolioSparkline
                  data={valueSeries}
                  currentValue={portfolioMetrics.portfolioValue}
                  dailyChangePercent={portfolioMetrics.dailyChangePercent}
                  width={320}
                  height={132}
                />
              </div>
            ) : (
              <div className="flex h-[132px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xs text-muted-foreground/70">
                暂无可绘制的日内仓位曲线
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1">
              {renderMoverColumn("Top Winners", topPositive, true)}
              {renderMoverColumn("Top Losers", topNegative, false)}
            </div>
            <div className="px-1 text-right text-[11px] text-muted-foreground/60">{updateInfo}</div>
          </div>
        </div>
      </div>

      <Dialog open={ytdDialogOpen} onOpenChange={(open) => setYtdDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置年初基准</DialogTitle>
            <DialogDescription>输入你希望用来计算 YTD 的起始市值（美元）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="number"
              placeholder="e.g. 5400000"
              value={ytdInputValue}
              onChange={(e) => setYtdInputValue(e.target.value)}
            />
            {ytdInputError && <p className="text-xs text-destructive">{ytdInputError}</p>}
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
