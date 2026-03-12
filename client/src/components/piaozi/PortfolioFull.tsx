import { useEffect, useMemo, useState } from "react";
import { PencilIcon, TrendingDown, TrendingUp } from "lucide-react";
import { useAuthAwareHoldings, Holding } from "@/hooks/useAuthAwareHoldings";
import { usePortfolioSummary, QuoteData } from "@/hooks/usePortfolioSummary";
import { Button } from "@/components/ui/button";
import HoldingsEditor from "@/components/HoldingsEditor";
import PortfolioSparkline from "@/components/PortfolioSparkline";
import { config } from "@/config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HoldingWithQuote extends Holding {
  quote?: QuoteData;
  marketValue?: number;
  dailyChange?: number;
  dailyChangePercent?: number;
}

export default function PortfolioFull() {
  const { holdings, isLoaded, ytdBaseline } = useAuthAwareHoldings();
  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  const [valueSeries, setValueSeries] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || holdings.length === 0) {
      setQuotesData({});
      setLoading(false);
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
        const quotes = result.quotes || [];
        const quotesMap: Record<string, QuoteData> = {};

        quotes.forEach((quote: any) => {
          const price = Number(quote.price);
          if (!isNaN(price) && price > 0) {
            quotesMap[quote.ticker.toUpperCase()] = {
              price,
              prevClose: quote.prevClose !== undefined ? Number(quote.prevClose) : undefined,
              change: quote.change !== undefined ? Number(quote.change) : undefined,
              changePercent:
                quote.changePercent !== undefined ? Number(quote.changePercent) : undefined,
              status: quote.status,
            };
          }
        });

        setQuotesData(quotesMap);
      } catch (error) {
        console.error("[PortfolioFull] Failed to fetch quotes:", error);
        setQuotesData({});
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
  }, [holdings, isLoaded]);

  useEffect(() => {
    if (!isLoaded || holdings.length === 0) {
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
        console.error("[PortfolioFull] Failed to fetch value series:", error);
      }
    };

    fetchValueSeries();
    const interval = setInterval(fetchValueSeries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [holdings, isLoaded]);

  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  const holdingsWithQuotes: HoldingWithQuote[] = useMemo(() => {
    return holdings
      .map((holding) => {
        const tickerUpper = holding.ticker.toUpperCase();
        const quote = quotesData[tickerUpper];

        if (!quote || quote.status !== "ok" || !quote.price) {
          return { ...holding, marketValue: 0 };
        }

        const shares = Number(holding.shares);
        const price = Number(quote.price);
        const marketValue = shares * price;

        let dailyChange: number | undefined;
        let dailyChangePercent: number | undefined;

        if (quote.prevClose !== undefined) {
          const prevClose = Number(quote.prevClose);
          if (!isNaN(prevClose) && prevClose > 0) {
            dailyChange = shares * (price - prevClose);
            dailyChangePercent = ((price - prevClose) / prevClose) * 100;
          }
        } else if (quote.change !== undefined) {
          dailyChange = shares * Number(quote.change);
          dailyChangePercent =
            quote.changePercent !== undefined ? Number(quote.changePercent) : undefined;
        }

        return {
          ...holding,
          quote,
          marketValue,
          dailyChange,
          dailyChangePercent,
        };
      })
      .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
  }, [holdings, quotesData]);

  const updateInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `更新 ${hours}:${minutes} · live`;
  }, []);

  if (!isLoaded || loading) {
    return (
      <div className="section-shell section-shell-market rounded-sm p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/4 rounded bg-muted" />
          <div className="h-48 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="section-shell section-shell-market rounded-sm p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow mb-2">Portfolio</div>
            <h2 className="text-xl font-semibold text-cyan-300/90">我的持仓</h2>
          </div>
          <HoldingsEditor
            trigger={
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-mono font-normal">
                <PencilIcon className="mr-1 h-3 w-3" /> 编辑仓位
              </Button>
            }
          />
        </div>
        <div className="py-12 text-center text-muted-foreground">
          <p>暂未配置持仓</p>
          <p className="mt-2 text-sm">点击“编辑仓位”添加您的投资组合</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-shell section-shell-market rounded-sm">
      <div className="border-b border-border/30 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="eyebrow mb-2">Portfolio</div>
            <h2 className="text-xl font-semibold text-cyan-300/90">我的持仓</h2>
            <p className="mt-1 text-sm text-muted-foreground/72">
              把总市值、日内变化和仓位明细放在同一屏里看。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="signal-chip">
              <span className="signal-dot bg-cyan-400 text-cyan-400" />
              {updateInfo}
            </span>
            <HoldingsEditor
              trigger={
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-mono font-normal">
                  <PencilIcon className="mr-1 h-3 w-3" /> 编辑仓位
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="border-b border-border/30 p-5">
        <div className="grid gap-5 md:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-sm border border-border/45 bg-card/45 p-4">
              <div className="eyebrow mb-2">Total Value</div>
              <div className="text-[34px] font-semibold leading-none text-foreground md:text-[44px]">
                ${portfolioMetrics.portfolioValue.toLocaleString()}
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-mono text-muted-foreground">Today</span>
                  <span
                    className={`font-mono tabular-nums ${
                      portfolioMetrics.dailyChangeAmount >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : "-"}$
                    {Math.abs(portfolioMetrics.dailyChangeAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    ({portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                    {portfolioMetrics.dailyChangePercent.toFixed(2)}%)
                  </span>
                </div>
                {portfolioMetrics.ytdChangeAmount !== null && portfolioMetrics.ytdPercent !== null && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono text-muted-foreground">YTD</span>
                    <span
                      className={`font-mono tabular-nums ${
                        portfolioMetrics.ytdChangeAmount >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {portfolioMetrics.ytdChangeAmount >= 0 ? "+" : "-"}$
                      {Math.abs(portfolioMetrics.ytdChangeAmount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      ({portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                      {portfolioMetrics.ytdPercent.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-sm border border-border/45 bg-card/45 p-4">
              <div className="eyebrow mb-2">Intraday Trend</div>
              <PortfolioSparkline
                data={valueSeries}
                currentValue={portfolioMetrics.portfolioValue}
                dailyChangePercent={portfolioMetrics.dailyChangePercent}
                width={340}
                height={88}
              />
            </div>
          </div>

          <div className="rounded-sm border border-border/45 bg-card/45 p-4">
            <div className="eyebrow mb-2">Position Summary</div>
            <div className="grid gap-3">
              {holdingsWithQuotes.slice(0, 6).map((holding) => {
                const isPositive = (holding.dailyChangePercent ?? 0) >= 0;
                return (
                  <div
                    key={holding.id}
                    className="grid grid-cols-[56px_1fr_auto] items-baseline gap-3 border-b border-border/25 pb-2 last:border-b-0"
                  >
                    <span className="text-sm font-medium font-mono text-foreground">
                      {holding.ticker}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground/70">
                      {(holding.marketValue || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {holding.dailyChangePercent !== undefined
                        ? `${isPositive ? "+" : ""}${holding.dailyChangePercent.toFixed(2)}%`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-3">
          <div className="eyebrow mb-2">Holdings</div>
          <h3 className="text-[15px] font-semibold text-foreground/88">持仓明细</h3>
        </div>
        <div className="overflow-x-auto rounded-sm border border-border/35 bg-card/35">
          <Table>
            <TableHeader>
              <TableRow className="border-border/35">
                <TableHead className="font-mono text-xs">代码</TableHead>
                <TableHead className="text-right font-mono text-xs">股数</TableHead>
                <TableHead className="text-right font-mono text-xs">现价</TableHead>
                <TableHead className="text-right font-mono text-xs">市值</TableHead>
                <TableHead className="text-right font-mono text-xs">今日涨跌</TableHead>
                <TableHead className="text-right font-mono text-xs">涨跌%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdingsWithQuotes.map((holding) => {
                const isPositive = (holding.dailyChangePercent ?? 0) >= 0;
                return (
                  <TableRow key={holding.id} className="border-border/25">
                    <TableCell className="font-mono font-medium">{holding.ticker}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {holding.shares.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {holding.quote?.price
                        ? `$${holding.quote.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {holding.marketValue
                        ? `$${holding.marketValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "-"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {holding.dailyChange !== undefined
                        ? `${isPositive ? "+" : "-"}$${Math.abs(holding.dailyChange).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.dailyChangePercent !== undefined ? (
                        <div className="flex items-center justify-end gap-1">
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-rose-400" />
                          )}
                          <span
                            className={`font-mono tabular-nums ${
                              isPositive ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {holding.dailyChangePercent.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
