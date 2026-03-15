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

interface SnapshotRow {
  label: string;
  value: number | string;
  changePercent?: number;
  status: string;
}

export default function IndicesCard() {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/market`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();
          setMarketData(result.data);
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
        value: getStatus(item) === "ok" ? getNumericValue(item) : "--",
        changePercent:
          getStatus(item) === "ok" && item.change_percent !== undefined
            ? Number(item.change_percent)
            : undefined,
        status: getStatus(item),
      };
    };

    return [
      buildRow("SPY", marketData.spy),
      buildRow("GOLD", marketData.gold),
      buildRow("BTC", marketData.btc),
    ].filter(Boolean) as SnapshotRow[];
  }, [marketData]);

  return (
    <div className="rounded-sm border border-border/35 bg-card/50 p-4">
      <div className="mb-3">
        <h3 className="text-[15px] font-semibold text-foreground/92">指数 & BTC</h3>
      </div>

      {loading || indices.length === 0 ? (
        <div className="grid gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-sm bg-muted/45" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {indices.map((item) => {
            const isPositive = item.changePercent !== undefined && item.changePercent >= 0;

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
                  ) : (
                    <span className="text-xs text-muted-foreground/72">--</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
