import { useEffect, useMemo, useState } from "react";
import { PencilIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import HoldingsEditor from "@/components/HoldingsEditor";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { config } from "@/config";
import { Holding } from "@/hooks/useHoldings";
import { QuoteData, usePortfolioSummary } from "@/hooks/usePortfolioSummary";

interface PortfolioHeroProps {
  quotesData: Record<string, QuoteData>;
  holdings: Holding[];
  holdingsLoaded: boolean;
  ytdBaseline: number | null;
  onYtdBaselineChange: (value: number | null) => void;
}

interface MarketDataItem {
  value: number | string;
  change_percent?: number;
  status?: "ok" | "stale" | "unavailable";
}

function formatMarketValue(value: number | string) {
  if (typeof value !== "number") return value;
  return value >= 1000 ? value.toLocaleString() : value.toFixed(2);
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
  const [marketData, setMarketData] = useState<{
    spy?: MarketDataItem;
    qqq?: MarketDataItem;
    btc?: MarketDataItem;
    gold?: MarketDataItem;
  } | null>(null);

  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  useEffect(() => {
    if (!ytdDialogOpen) {
      setYtdInputValue(ytdBaseline?.toString() || "");
      setYtdInputError(null);
    }
  }, [ytdBaseline, ytdDialogOpen]);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/market`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`Market API error: ${response.status}`);
        }

        const result = await response.json();
        setMarketData(result.data || null);
      } catch (error) {
        console.error("[PortfolioHero] Failed to fetch market data:", error);
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const updateInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes} live`;
  }, []);

  const { topPositive, topNegative } = useMemo(() => {
    const positive: Array<{ ticker: string; dailyChangePercent: number }> = [];
    const negative: Array<{ ticker: string; dailyChangePercent: number }> = [];

    holdings.forEach((holding) => {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];
      const shares = Number(holding.shares);

      if (quote && quote.status === "ok" && quote.price > 0 && !Number.isNaN(shares) && shares > 0) {
        const price = Number(quote.price);
        const prevClose = quote.prevClose !== undefined ? Number(quote.prevClose) : undefined;

        if (!Number.isNaN(price) && price > 0) {
          let dailyChangePercent = 0;
          if (prevClose !== undefined && !Number.isNaN(prevClose) && prevClose > 0) {
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

  const marketCards = useMemo(() => {
    if (!marketData) return [];

    return [
      { code: "SPY", item: marketData.spy },
      { code: "QQQ", item: marketData.qqq },
      { code: "BTC", item: marketData.btc },
      { code: "GLD", item: marketData.gold },
    ]
      .filter((entry) => entry.item)
      .map(({ code, item }) => ({
        code,
        value: item?.value ?? "Unavailable",
        changePercent: item?.change_percent !== undefined ? Number(item.change_percent) : undefined,
      }));
  }, [marketData]);

  const handleYtdSave = () => {
    const parsed = parseFloat(ytdInputValue);
    if (!Number.isNaN(parsed) && parsed > 0) {
      onYtdBaselineChange(parsed);
      setYtdDialogOpen(false);
    } else {
      setYtdInputError("Please enter a valid number greater than 0");
    }
  };

  const renderMoverBlock = (
    label: string,
    movers: Array<{ ticker: string; dailyChangePercent: number }>,
    isPositive: boolean,
  ) => (
    <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/68">
        {label}
      </div>
      {movers.length > 0 ? (
        <div className="space-y-1.5">
          {movers.map((mover) => (
            <div key={mover.ticker} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground/86">{mover.ticker}</span>
              <span
                className={`inline-flex items-center gap-1 tabular-nums ${
                  isPositive ? "text-emerald-300/90" : "text-rose-300/90"
                }`}
              >
                {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {mover.dailyChangePercent >= 0 ? "+" : ""}
                {mover.dailyChangePercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/55">No names yet</div>
      )}
    </div>
  );

  const renderMarketBlock = (entry: { code: string; value: number | string; changePercent?: number }) => {
    const positive = (entry.changePercent ?? 0) >= 0;

    return (
      <div
        key={entry.code}
        className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground/86">{entry.code}</span>
          <span
            className={`text-xs font-mono tabular-nums ${
              positive ? "text-emerald-300/90" : "text-rose-300/90"
            }`}
          >
            {entry.changePercent !== undefined ? `${positive ? "+" : ""}${entry.changePercent.toFixed(2)}%` : "--"}
          </span>
        </div>
        <div className="mt-1.5 text-base font-semibold font-mono tabular-nums text-foreground/88">
          {formatMarketValue(entry.value)}
        </div>
      </div>
    );
  };

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
        <div className="mb-3 text-sm text-muted-foreground">No holdings yet</div>
        <HoldingsEditor
          trigger={
            <Button variant="outline" size="sm" className="h-9 rounded-full px-4 text-xs font-medium">
              <PencilIcon className="mr-1 h-3 w-3" /> Add holdings
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="hero-panel rounded-[1.2rem] p-3 md:p-4">
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[1.55fr_0.72fr_1fr]">
          <div className="min-w-0">
            <div className="mb-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-foreground md:text-[38px]">
              ${portfolioMetrics.portfolioValue.toLocaleString()}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground/68">Today</span>
              <span
                className={`font-medium tabular-nums ${
                  portfolioMetrics.dailyChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                {portfolioMetrics.dailyChangePercent.toFixed(2)}%
              </span>
              <span
                className={`text-xs tabular-nums opacity-72 ${
                  portfolioMetrics.dailyChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : "-"}$
                {Math.abs(portfolioMetrics.dailyChangeAmount).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
              <button
                type="button"
                onClick={() => setYtdDialogOpen(true)}
                className="inline-flex items-center gap-1 text-xs transition-colors hover:text-foreground"
              >
                <span className="text-muted-foreground/52">YTD</span>
                <PencilIcon className="h-3 w-3 text-muted-foreground/55" />
              </button>
              <button
                type="button"
                onClick={() => setYtdDialogOpen(true)}
                className={`text-xs tabular-nums transition-colors hover:text-foreground ${
                  portfolioMetrics.ytdPercent !== null
                    ? portfolioMetrics.ytdPercent >= 0
                      ? "text-emerald-300/88"
                      : "text-rose-300/88"
                    : "text-muted-foreground/42"
                }`}
              >
                {portfolioMetrics.ytdChangeAmount !== null && portfolioMetrics.ytdPercent !== null ? (
                  <>
                    {portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                    {portfolioMetrics.ytdPercent.toFixed(2)}%
                  </>
                ) : (
                  "Set base"
                )}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/58">
              movers
            </div>
            <div className="space-y-2">
              {renderMoverBlock("Winners", topPositive, true)}
              {renderMoverBlock("Losers", topNegative, false)}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/58">
              <span>benchmarks</span>
              <span>{updateInfo}</span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0 xl:pb-0">
              {marketCards.map((entry) => (
                <div key={entry.code} className="min-w-[108px] shrink-0 xl:min-w-0">
                  {renderMarketBlock(entry)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={ytdDialogOpen} onOpenChange={(open) => setYtdDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set YTD baseline</DialogTitle>
            <DialogDescription>Enter the starting portfolio value used for YTD calculation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="number"
              placeholder="e.g. 5400000"
              value={ytdInputValue}
              onChange={(e) => setYtdInputValue(e.target.value)}
            />
            {ytdInputError ? <p className="text-xs text-destructive">{ytdInputError}</p> : null}
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setYtdDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleYtdSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
