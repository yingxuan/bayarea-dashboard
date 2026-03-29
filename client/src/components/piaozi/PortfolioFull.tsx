import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, PencilIcon, TrendingDown, TrendingUp } from "lucide-react";
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

interface MarketDataItem {
  value: number | string;
  change_percent?: number;
  status?: "ok" | "stale" | "unavailable";
}

type SortKey =
  | "ticker"
  | "shares"
  | "price"
  | "marketValue"
  | "dailyChange"
  | "dailyChangePercent";

type SortDirection = "asc" | "desc";

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = activeKey === sortKey;

  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`inline-flex items-center gap-1.5 text-xs transition-colors hover:text-foreground ${
        align === "right" ? "ml-auto justify-end" : ""
      } ${isActive ? "text-foreground" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <ArrowDownUp className={`h-3 w-3 ${isActive ? "opacity-100" : "opacity-45"}`} />
      {isActive ? <span className="text-[10px] font-mono">{direction === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

function getSortValue(holding: HoldingWithQuote, sortKey: SortKey) {
  switch (sortKey) {
    case "ticker":
      return holding.ticker.toUpperCase();
    case "shares":
      return Number(holding.shares) || 0;
    case "price":
      return holding.quote?.price ?? Number.NEGATIVE_INFINITY;
    case "marketValue":
      return holding.marketValue ?? Number.NEGATIVE_INFINITY;
    case "dailyChange":
      return holding.dailyChange ?? Number.NEGATIVE_INFINITY;
    case "dailyChangePercent":
      return holding.dailyChangePercent ?? Number.NEGATIVE_INFINITY;
    default:
      return 0;
  }
}

function formatSignedCurrency(value?: number) {
  if (value === undefined) return "-";
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPrice(value?: number) {
  if (value === undefined) return "-";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMarketValue(value: number | string) {
  if (typeof value !== "number") return value;
  return value >= 1000 ? value.toLocaleString() : value.toFixed(2);
}

export default function PortfolioFull() {
  const MOBILE_HOLDING_PREVIEW = 4;
  const { holdings, isLoaded, ytdBaseline } = useAuthAwareHoldings();
  const [quotesData, setQuotesData] = useState<Record<string, QuoteData>>({});
  const [valueSeries, setValueSeries] = useState<any>(null);
  const [marketData, setMarketData] = useState<{
    spy?: MarketDataItem;
    qqq?: MarketDataItem;
    btc?: MarketDataItem;
    gold?: MarketDataItem;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    if (!isLoaded || holdings.length === 0) {
      setQuotesData({});
      setLoading(false);
      return;
    }

    async function fetchQuotes() {
      try {
        const tickers = holdings.map((h) => h.ticker.toUpperCase()).join(",");
        const response = await fetch(
          `${config.apiBaseUrl}/api/quotes?tickers=${encodeURIComponent(tickers)}`,
          { signal: AbortSignal.timeout(10000) },
        );

        if (!response.ok) {
          throw new Error(`Quotes API error: ${response.status}`);
        }

        const result = await response.json();
        const quotesMap: Record<string, QuoteData> = {};

        for (const quote of result.quotes || []) {
          const price = Number(quote.price);
          if (isNaN(price) || price <= 0) continue;
          quotesMap[quote.ticker.toUpperCase()] = {
            price,
            prevClose: quote.prevClose !== undefined ? Number(quote.prevClose) : undefined,
            change: quote.change !== undefined ? Number(quote.change) : undefined,
            changePercent: quote.changePercent !== undefined ? Number(quote.changePercent) : undefined,
            status: quote.status,
          };
        }

        setQuotesData(quotesMap);
      } catch (error) {
        console.error("[PortfolioFull] Failed to fetch quotes:", error);
        setQuotesData({});
      } finally {
        setLoading(false);
      }
    }

    fetchQuotes();
  }, [holdings, isLoaded]);

  useEffect(() => {
    if (!isLoaded || holdings.length === 0) {
      setValueSeries(null);
      return;
    }

    async function fetchValueSeries() {
      try {
        const holdingsParam = encodeURIComponent(
          JSON.stringify(holdings.map((h) => ({ ticker: h.ticker, shares: Number(h.shares) }))),
        );
        const response = await fetch(
          `${config.apiBaseUrl}/api/portfolio/value-series?range=1d&interval=5m&holdings=${holdingsParam}`,
          { signal: AbortSignal.timeout(10000) },
        );

        if (!response.ok) {
          throw new Error(`Value series API error: ${response.status}`);
        }

        const result = await response.json();
        setValueSeries(result);
      } catch (error) {
        console.error("[PortfolioFull] Failed to fetch value series:", error);
      }
    }

    fetchValueSeries();
    const interval = setInterval(fetchValueSeries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [holdings, isLoaded]);

  useEffect(() => {
    async function fetchMarketData() {
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
        console.error("[PortfolioFull] Failed to fetch market data:", error);
      }
    }

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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

  const sortedHoldings = useMemo(() => {
    return [...holdingsWithQuotes].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      if (typeof aValue === "string" && typeof bValue === "string") {
        const result = aValue.localeCompare(bValue);
        return sortDirection === "asc" ? result : -result;
      }

      const numericA = Number(aValue);
      const numericB = Number(bValue);

      if (numericA === numericB) {
        return a.ticker.localeCompare(b.ticker);
      }

      return sortDirection === "asc" ? numericA - numericB : numericB - numericA;
    });
  }, [holdingsWithQuotes, sortDirection, sortKey]);

  const marketCards = useMemo(() => {
    if (!marketData) return [];

    return [
      { code: "SPY", item: marketData.spy },
      { code: "QQQ", item: marketData.qqq },
      { code: "BTC", item: marketData.btc },
      { code: "GOLD", item: marketData.gold },
    ]
      .filter((entry) => entry.item)
      .map(({ code, item }) => ({
        code,
        value: item?.value ?? "Unavailable",
        changePercent: item?.change_percent !== undefined ? Number(item.change_percent) : undefined,
        status: item?.status ?? "unavailable",
      }));
  }, [marketData]);

  const handleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "ticker" ? "asc" : "desc");
  };

  const updateInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `更新 ${hours}:${minutes}`;
  }, []);

  const mobileHoldings = mobileExpanded
    ? sortedHoldings
    : sortedHoldings.slice(0, MOBILE_HOLDING_PREVIEW);

  if (!isLoaded || loading) {
    return (
      <section className="section-shell section-shell-market min-w-0 rounded-[1.25rem] p-4 md:p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-48 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </section>
    );
  }

  if (holdings.length === 0) {
    return (
      <section className="section-shell section-shell-market min-w-0 rounded-[1.25rem] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-cyan-300/90">持仓</h2>
          <HoldingsEditor
            trigger={
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium">
                <PencilIcon className="mr-1 h-3 w-3" /> 编辑仓位
              </Button>
            }
          />
        </div>
        <div className="py-12 text-center text-muted-foreground">暂未配置持仓</div>
      </section>
    );
  }

  return (
    <section className="section-shell section-shell-market min-w-0 rounded-[1.25rem]">
      <div className="border-b border-border/30 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-semibold text-cyan-300/90">持仓</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground/65">{updateInfo}</span>
            <HoldingsEditor
              trigger={
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium">
                  <PencilIcon className="mr-1 h-3 w-3" /> 编辑仓位
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="border-b border-border/30 p-4 md:p-5">
        <div className="grid gap-3 xl:grid-cols-[1.45fr_0.85fr]">
          <div className="min-w-0 rounded-[1rem] border border-border/35 bg-card/40 p-4">
            <div className="text-[32px] font-semibold leading-none text-foreground md:text-[44px]">
              ${portfolioMetrics.portfolioValue.toLocaleString()}
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">今日</span>
              <span
                className={`text-sm font-mono tabular-nums ${
                  portfolioMetrics.dailyChangeAmount >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatSignedCurrency(portfolioMetrics.dailyChangeAmount)} (
                {portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
                {portfolioMetrics.dailyChangePercent.toFixed(2)}%)
              </span>
              {portfolioMetrics.ytdChangeAmount !== null && portfolioMetrics.ytdPercent !== null ? (
                <>
                  <span className="text-xs text-muted-foreground">YTD</span>
                  <span
                    className={`text-sm font-mono tabular-nums ${
                      portfolioMetrics.ytdChangeAmount >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatSignedCurrency(portfolioMetrics.ytdChangeAmount)} (
                    {portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                    {portfolioMetrics.ytdPercent.toFixed(2)}%)
                  </span>
                </>
              ) : null}
            </div>

            <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/5 p-3">
              <PortfolioSparkline
                data={valueSeries}
                currentValue={portfolioMetrics.portfolioValue}
                dailyChangePercent={portfolioMetrics.dailyChangePercent}
                width={420}
                height={108}
              />
            </div>
          </div>

          <div className="min-w-0 rounded-[1rem] border border-border/35 bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground/92">大盘 & 避险</h3>
              <span className="text-[11px] font-mono text-muted-foreground/65">live</span>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {marketCards.map((entry) => {
                const positive = (entry.changePercent ?? 0) >= 0;

                return (
                  <div
                    key={entry.code}
                    className="min-w-[120px] shrink-0 rounded-[0.9rem] border border-border/20 bg-background/35 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">{entry.code}</span>
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          positive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {entry.changePercent !== undefined
                          ? `${positive ? "+" : ""}${entry.changePercent.toFixed(2)}%`
                          : "--"}
                      </span>
                    </div>
                    <div className="mt-1.5 text-lg font-semibold font-mono tabular-nums text-foreground">
                      {formatMarketValue(entry.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-5">
        <div className="space-y-2 md:hidden">
          {mobileHoldings.map((holding) => {
            const isPositive = (holding.dailyChangePercent ?? 0) >= 0;
            return (
              <div
                key={holding.id}
                className="min-w-0 rounded-[0.9rem] border border-border/30 bg-card/35 px-3 py-3"
              >
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{holding.ticker}</div>
                    <div className="mt-1 text-[11px] font-mono text-muted-foreground/70">
                      {holding.shares.toLocaleString()} shares
                    </div>
                  </div>
                  <div className="min-w-0 text-right">
                    <div className="text-sm font-semibold text-foreground">
                      {formatPrice(holding.quote?.price)}
                    </div>
                    <div className="mt-1 max-w-[9rem] truncate text-[11px] font-mono text-muted-foreground/70">
                      市值 {formatPrice(holding.marketValue)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[0.8rem] bg-background/35 px-3 py-2">
                  <span className="text-[11px] text-muted-foreground">今日</span>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                    {holding.dailyChangePercent !== undefined ? (
                      isPositive ? (
                        <TrendingUp className="h-3 w-3 shrink-0 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-3 w-3 shrink-0 text-rose-400" />
                      )
                    ) : null}
                    <span
                      className={`text-[12px] font-mono tabular-nums ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {holding.dailyChange !== undefined ? formatSignedCurrency(holding.dailyChange) : "-"}
                    </span>
                    <span
                      className={`text-[12px] font-mono tabular-nums ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {holding.dailyChangePercent !== undefined
                        ? `${isPositive ? "+" : ""}${holding.dailyChangePercent.toFixed(2)}%`
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {sortedHoldings.length > MOBILE_HOLDING_PREVIEW ? (
            <button
              type="button"
              onClick={() => setMobileExpanded((current) => !current)}
              className="w-full rounded-[0.9rem] border border-border/30 bg-background/30 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-background/45 hover:text-foreground"
            >
              {mobileExpanded
                ? "收起持仓"
                : `展开其余 ${sortedHoldings.length - MOBILE_HOLDING_PREVIEW} 个持仓`}
            </button>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto rounded-[1rem] border border-border/35 bg-card/35 md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-border/35">
                <TableHead className="text-xs">
                  <SortHeader
                    label="代码"
                    sortKey="ticker"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </TableHead>
                <TableHead className="text-right text-xs">
                  <SortHeader
                    label="股数"
                    sortKey="shares"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right text-xs">
                  <SortHeader
                    label="现价"
                    sortKey="price"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right text-xs">
                  <SortHeader
                    label="市值"
                    sortKey="marketValue"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right text-xs">
                  <SortHeader
                    label="今日涨跌"
                    sortKey="dailyChange"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-right text-xs">
                  <SortHeader
                    label="涨跌%"
                    sortKey="dailyChangePercent"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                    align="right"
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHoldings.map((holding) => {
                const isPositive = (holding.dailyChangePercent ?? 0) >= 0;
                return (
                  <TableRow key={holding.id} className="border-border/25">
                    <TableCell className="font-medium">{holding.ticker}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {holding.shares.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatPrice(holding.quote?.price)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatPrice(holding.marketValue)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {holding.dailyChange !== undefined ? formatSignedCurrency(holding.dailyChange) : "-"}
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
    </section>
  );
}
