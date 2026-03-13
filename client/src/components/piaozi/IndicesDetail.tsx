import { useEffect, useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { config } from "@/config";
import { getNumericValue, getStatus } from "@shared/utils";

interface MarketDataItem {
  value: number | string;
  change?: number;
  change_percent?: number;
  status?: "ok" | "stale" | "unavailable";
}

interface IndexData {
  code: string;
  value: number | string;
  change?: number;
  changePercent?: number;
  status: string;
}

function formatValue(value: number | string) {
  if (typeof value !== "number") return value;
  return value >= 1000 ? value.toLocaleString() : value.toFixed(2);
}

export default function IndicesDetail() {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
    qqq?: MarketDataItem;
    arkk?: MarketDataItem;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/market`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        setMarketData(result.data);
      } catch (error) {
        console.error("[IndicesDetail] Failed to fetch market data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const indices = useMemo<IndexData[]>(() => {
    if (!marketData) return [];

    const items: Array<[string, MarketDataItem | undefined]> = [
      ["SPY", marketData.spy],
      ["QQQ", marketData.qqq],
      ["BTC", marketData.btc],
      ["GOLD", marketData.gold],
      ["ARKK", marketData.arkk],
    ];

    return items
      .filter(([, item]) => item)
      .map(([code, item]) => {
        const safeItem = item as MarketDataItem;
        const status = getStatus(safeItem);
        return {
          code,
          value: status === "ok" ? getNumericValue(safeItem) : "Unavailable",
          change: status === "ok" && safeItem.change !== undefined ? Number(safeItem.change) : undefined,
          changePercent:
            status === "ok" && safeItem.change_percent !== undefined
              ? Number(safeItem.change_percent)
              : undefined,
          status,
        };
      });
  }, [marketData]);

  if (loading) {
    return (
      <section className="section-shell section-shell-market rounded-sm p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 rounded bg-muted" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell section-shell-market rounded-sm p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-cyan-300/90">指数 & BTC</h2>
        <span className="text-[11px] font-mono text-muted-foreground/70">5m refresh</span>
      </div>

      {indices.length === 0 ? (
        <div className="rounded-sm border border-border/35 bg-card/35 px-4 py-8 text-center text-sm text-muted-foreground">
          暂无数据
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {indices.map((index) => {
            const unavailable = index.status === "unavailable";
            const positive =
              (index.changePercent !== undefined && index.changePercent >= 0) ||
              (index.change !== undefined && index.change >= 0);

            return (
              <div
                key={index.code}
                className="rounded-sm border border-border/35 bg-card/45 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground/92">{index.code}</span>
                  {unavailable ? (
                    <span className="text-[11px] font-mono text-muted-foreground/70">offline</span>
                  ) : positive ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                  )}
                </div>

                <div className="mt-3 text-2xl font-semibold font-mono tabular-nums text-foreground">
                  {formatValue(index.value)}
                </div>

                {!unavailable && index.changePercent !== undefined ? (
                  <div
                    className={`mt-2 text-sm font-mono tabular-nums ${
                      positive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {index.changePercent >= 0 ? "+" : ""}
                    {index.changePercent.toFixed(2)}%
                    {index.change !== undefined ? (
                      <span className="ml-2 text-[11px] opacity-70">
                        {index.change >= 0 ? "+" : ""}
                        {index.change.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 text-sm font-mono text-muted-foreground/70">Unavailable</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
