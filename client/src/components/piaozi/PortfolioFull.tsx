/**
 * Portfolio Full Component (Complete Holdings View)
 * Displays complete portfolio with:
 * - Full holdings table with all positions
 * - Larger chart with more data points
 * - YTD performance
 * - Detailed metrics per holding
 */

import { useEffect, useState, useMemo } from "react";
import { TrendingUp, TrendingDown, PencilIcon } from "lucide-react";
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

  // Fetch quotes when holdings change
  useEffect(() => {
    if (!isLoaded || holdings.length === 0) {
      setQuotesData({});
      setLoading(false);
      return;
    }

    const fetchQuotes = async () => {
      try {
        const tickers = holdings.map(h => h.ticker.toUpperCase()).join(',');
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
          status: 'ok' | 'stale' | 'unavailable';
          price: number;
          prevClose?: number;
          change?: number;
          changePercent?: number;
        }> = result.quotes || [];

        const quotesMap: Record<string, QuoteData> = {};
        quotes.forEach(quote => {
          const price = Number(quote.price);
          if (!isNaN(price) && price > 0) {
            quotesMap[quote.ticker.toUpperCase()] = {
              price,
              prevClose: quote.prevClose !== undefined ? Number(quote.prevClose) : undefined,
              change: quote.change !== undefined ? Number(quote.change) : undefined,
              changePercent: quote.changePercent !== undefined ? Number(quote.changePercent) : undefined,
              status: quote.status,
            };
          }
        });

        setQuotesData(quotesMap);
      } catch (error) {
        console.error('[PortfolioFull] Failed to fetch quotes:', error);
        setQuotesData({});
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
  }, [holdings, isLoaded]);

  // Fetch value series for larger chart
  useEffect(() => {
    if (!isLoaded || holdings.length === 0) {
      setValueSeries(null);
      return;
    }

    const fetchValueSeries = async () => {
      try {
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
        console.error('[PortfolioFull] Failed to fetch value series:', error);
      }
    };

    fetchValueSeries();
    const interval = setInterval(fetchValueSeries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [holdings, isLoaded]);

  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  // Calculate holdings with quotes
  const holdingsWithQuotes: HoldingWithQuote[] = useMemo(() => {
    return holdings.map(holding => {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];

      if (!quote || quote.status !== 'ok' || !quote.price) {
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
        dailyChangePercent = quote.changePercent !== undefined ? Number(quote.changePercent) : undefined;
      }

      return {
        ...holding,
        quote,
        marketValue,
        dailyChange,
        dailyChangePercent,
      };
    }).sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
  }, [holdings, quotesData]);

  // Update time
  const updateInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `更新 ${hours}:${minutes} · live`;
  }, []);

  if (!isLoaded || loading) {
    return (
      <div className="bg-card rounded-sm shadow-md border border-border/40 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-48 bg-muted rounded"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="bg-card rounded-sm shadow-md border border-border/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-mono font-medium text-foreground">我的持仓</h2>
          <HoldingsEditor
            trigger={
              <Button variant="outline" size="sm" className="text-xs h-7 px-2 font-mono font-normal">
                <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
              </Button>
            }
          />
        </div>
        <div className="text-center py-12 text-muted-foreground font-mono">
          <p>暂未配置持仓</p>
          <p className="text-sm mt-2">点击「编辑仓位」添加您的投资组合</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-sm shadow-md border border-border/40">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-mono font-medium text-foreground">我的持仓</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-60 font-mono">{updateInfo}</span>
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

      {/* Summary Section */}
      <div className="p-4 border-b border-border/30">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Portfolio Value + Change */}
          <div className="space-y-3">
            <div>
              <span className="text-[32px] md:text-[40px] font-mono font-semibold text-foreground leading-[1.1] tabular-nums">
                ${portfolioMetrics.portfolioValue.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-4 text-[15px]">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-muted-foreground">Today:</span>
                <span
                  className={`font-mono tabular-nums ${
                    portfolioMetrics.dailyChangeAmount >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : "-"}
                  ${Math.abs(portfolioMetrics.dailyChangeAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {" "}
                  ({portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                  {portfolioMetrics.dailyChangePercent.toFixed(2)}%)
                </span>
              </div>
              {portfolioMetrics.ytdChangeAmount !== null && portfolioMetrics.ytdPercent !== null && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-mono text-muted-foreground">YTD:</span>
                  <span
                    className={`font-mono tabular-nums ${
                      portfolioMetrics.ytdChangeAmount >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {portfolioMetrics.ytdChangeAmount >= 0 ? "+" : "-"}
                    ${Math.abs(portfolioMetrics.ytdChangeAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {" "}
                    ({portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                    {portfolioMetrics.ytdPercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Larger Sparkline */}
          <div className="flex items-center justify-center md:justify-end">
            <PortfolioSparkline
              data={valueSeries}
              currentValue={portfolioMetrics.portfolioValue}
              dailyChangePercent={portfolioMetrics.dailyChangePercent}
              width={320}
              height={80}
            />
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="p-4">
        <h3 className="text-sm font-mono font-medium text-foreground/80 mb-3">持仓明细</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">代码</TableHead>
                <TableHead className="font-mono text-xs text-right">股数</TableHead>
                <TableHead className="font-mono text-xs text-right">现价</TableHead>
                <TableHead className="font-mono text-xs text-right">市值</TableHead>
                <TableHead className="font-mono text-xs text-right">今日涨跌</TableHead>
                <TableHead className="font-mono text-xs text-right">涨跌%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdingsWithQuotes.map((holding) => {
                const isPositive = (holding.dailyChangePercent ?? 0) >= 0;
                return (
                  <TableRow key={holding.id}>
                    <TableCell className="font-mono font-medium">{holding.ticker}</TableCell>
                    <TableCell className="font-mono text-right tabular-nums">
                      {holding.shares.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-right tabular-nums">
                      {holding.quote?.price
                        ? `$${holding.quote.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="font-mono text-right tabular-nums">
                      {holding.marketValue
                        ? `$${holding.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell className={`font-mono text-right tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {holding.dailyChange !== undefined
                        ? `${isPositive ? '+' : '-'}$${Math.abs(holding.dailyChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.dailyChangePercent !== undefined ? (
                        <div className="flex items-center justify-end gap-1">
                          {isPositive ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className={`font-mono tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{holding.dailyChangePercent.toFixed(2)}%
                          </span>
                        </div>
                      ) : '-'}
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
