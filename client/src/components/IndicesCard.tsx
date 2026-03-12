import { useEffect, useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { config } from "@/config";
import { getNumericValue, getStatus } from "@shared/utils";

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  status?: "ok" | "stale" | "unavailable";
}

interface QuoteItem {
  ticker: string;
  status: "ok" | "stale" | "unavailable";
  price: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
}

interface WeatherData {
  status: "ok" | "unavailable";
  city?: string;
  tempF?: number;
  emoji?: string;
  rainProbability?: number;
}

interface SnapshotRow {
  label: string;
  value: number | string;
  change?: number;
  changePercent?: number;
  status: string;
}

const TECH_TICKERS = ["NVDA", "AAPL", "META", "GOOGL"];

export default function IndicesCard() {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
    qqq?: MarketDataItem;
    arkk?: MarketDataItem;
  } | null>(null);
  const [techStocks, setTechStocks] = useState<QuoteItem[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const [marketResp, quotesResp, weatherResp] = await Promise.all([
          fetch(`${config.apiBaseUrl}/api/market`, { signal: controller.signal }),
          fetch(`${config.apiBaseUrl}/api/quotes?tickers=${TECH_TICKERS.join(",")}`, {
            signal: controller.signal,
          }),
          fetch(`${config.apiBaseUrl}/api/weather`, { signal: controller.signal }),
        ]);

        clearTimeout(timeoutId);

        if (marketResp.ok) {
          const result = await marketResp.json();
          setMarketData(result.data);
        }
        if (quotesResp.ok) {
          const result = await quotesResp.json();
          setTechStocks(result.quotes || []);
        }
        if (weatherResp.ok) {
          const result = await weatherResp.json();
          setWeather(result);
        }
      } catch (error) {
        console.error("[IndicesCard] Failed to fetch market data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const indices: SnapshotRow[] = useMemo(() => {
    if (!marketData) return [];

    const buildRow = (label: string, item?: MarketDataItem): SnapshotRow | null => {
      if (!item) return null;
      return {
        label,
        value: getStatus(item) === "ok" ? getNumericValue(item) : "Unavailable",
        change:
          getStatus(item) === "ok" && item.change !== undefined ? Number(item.change) : undefined,
        changePercent:
          getStatus(item) === "ok" && item.change_percent !== undefined
            ? Number(item.change_percent)
            : undefined,
        status: getStatus(item),
      };
    };

    return [
      buildRow("SPY", marketData.spy),
      buildRow("QQQ", marketData.qqq),
      buildRow("BTC", marketData.btc),
      buildRow("GOLD", marketData.gold),
      buildRow("ARKK", marketData.arkk),
    ].filter(Boolean) as SnapshotRow[];
  }, [marketData]);

  const toneText = loading
    ? "Loading"
    : weather?.status === "ok" && weather.tempF !== undefined
      ? `${weather.emoji || ""} ${weather.tempF}°F${weather.rainProbability ? ` · 雨 ${weather.rainProbability}%` : ""}`
      : "Market + weather snapshot";

  return (
    <div className="flex h-full flex-col rounded-sm border border-border/35 bg-card/50">
      <div className="border-b border-border/25 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow mb-2">Snapshot</div>
            <h3 className="text-[15px] font-semibold text-foreground/92">指数与天气</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{toneText}</p>
          </div>
          <span className="signal-chip shrink-0">
            <span className="signal-dot bg-cyan-300" />
            {indices.length + techStocks.length} lines
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {loading || indices.length === 0 ? (
          <div className="grid gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-sm bg-muted/45" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              {indices.map((item) => {
                const isPositive =
                  (item.changePercent !== undefined && item.changePercent >= 0) ||
                  (item.change !== undefined && item.change >= 0);

                return (
                  <div
                    key={item.label}
                    className="grid grid-cols-[auto_1fr] gap-3 rounded-sm border border-border/25 bg-background/45 px-3 py-2.5"
                  >
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                        {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center">
                      {item.status === "unavailable" ? (
                        <span className="text-xs text-muted-foreground/72">不可用</span>
                      ) : item.changePercent !== undefined ? (
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-mono tabular-nums ${
                            isPositive ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {item.changePercent >= 0 ? "+" : ""}
                          {item.changePercent.toFixed(2)}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {techStocks.length > 0 ? (
              <div className="border-t border-border/25 pt-4">
                <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Tech Watch
                </div>
                <div className="grid gap-2">
                  {techStocks.map((stock) => {
                    const isPositive = (stock.changePercent ?? 0) >= 0;

                    return (
                      <div
                        key={stock.ticker}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-sm bg-background/35 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-foreground/90">{stock.ticker}</span>
                        <span className="text-right text-sm font-mono tabular-nums text-foreground">
                          {stock.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                        <span
                          className={`text-xs font-mono tabular-nums ${
                            isPositive ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {stock.changePercent !== undefined
                            ? `${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}%`
                            : "--"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
