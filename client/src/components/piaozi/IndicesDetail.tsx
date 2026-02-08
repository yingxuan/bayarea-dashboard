/**
 * Indices Detail Component (Extended Market Indices View)
 * Displays more indices including:
 * - SPY, QQQ, BTC, GOLD, ARKK (from home)
 * - Additional: VIX, DXY, etc.
 * - Daily/Weekly change indicators
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { config } from "@/config";
import { getStatus, getNumericValue } from "@shared/utils";

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  status?: "ok" | "stale" | "unavailable";
  asOf?: string;
  source?: {
    name: string;
    url: string;
  };
  ttlSeconds?: number;
  error?: string;
}

interface IndexData {
  code: string;
  label: string;
  value: number | string;
  change?: number;
  changePercent?: number;
  status: string;
}

export default function IndicesDetail() {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
    qqq?: MarketDataItem;
    arkk?: MarketDataItem;
    vix?: MarketDataItem;
    dxy?: MarketDataItem;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch market data
  useEffect(() => {
    const loadData = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const apiUrl = `${config.apiBaseUrl}/api/market`;
        const response = await fetch(apiUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

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

  // Prepare indices data
  const indices: IndexData[] = marketData ? [
    {
      code: "SPY",
      label: "大盘 S&P 500",
      value: getStatus(marketData.spy) === "ok" ? getNumericValue(marketData.spy) : "Unavailable",
      change: getStatus(marketData.spy) === "ok" && marketData.spy.change !== undefined ? Number(marketData.spy.change) : undefined,
      changePercent: getStatus(marketData.spy) === "ok" && marketData.spy.change_percent !== undefined ? Number(marketData.spy.change_percent) : undefined,
      status: getStatus(marketData.spy),
    },
    ...(marketData.qqq ? [{
      code: "QQQ",
      label: "科技股 纳斯达克",
      value: getStatus(marketData.qqq) === "ok" ? getNumericValue(marketData.qqq) : "Unavailable",
      change: getStatus(marketData.qqq) === "ok" && marketData.qqq.change !== undefined ? Number(marketData.qqq.change) : undefined,
      changePercent: getStatus(marketData.qqq) === "ok" && marketData.qqq.change_percent !== undefined ? Number(marketData.qqq.change_percent) : undefined,
      status: getStatus(marketData.qqq),
    }] : []),
    {
      code: "BTC",
      label: "比特币",
      value: getStatus(marketData.btc) === "ok" ? getNumericValue(marketData.btc) : "Unavailable",
      change: getStatus(marketData.btc) === "ok" && marketData.btc.change !== undefined ? Number(marketData.btc.change) : undefined,
      changePercent: getStatus(marketData.btc) === "ok" && marketData.btc.change_percent !== undefined ? Number(marketData.btc.change_percent) : undefined,
      status: getStatus(marketData.btc),
    },
    {
      code: "GOLD",
      label: "黄金",
      value: getStatus(marketData.gold) === "ok" ? getNumericValue(marketData.gold) : "Unavailable",
      change: getStatus(marketData.gold) === "ok" && marketData.gold.change !== undefined ? Number(marketData.gold.change) : undefined,
      changePercent: getStatus(marketData.gold) === "ok" && marketData.gold.change_percent !== undefined ? Number(marketData.gold.change_percent) : undefined,
      status: getStatus(marketData.gold),
    },
    ...(marketData.arkk ? [{
      code: "ARKK",
      label: "妖股 ARK",
      value: getStatus(marketData.arkk) === "ok" ? getNumericValue(marketData.arkk) : "Unavailable",
      change: getStatus(marketData.arkk) === "ok" && marketData.arkk.change !== undefined ? Number(marketData.arkk.change) : undefined,
      changePercent: getStatus(marketData.arkk) === "ok" && marketData.arkk.change_percent !== undefined ? Number(marketData.arkk.change_percent) : undefined,
      status: getStatus(marketData.arkk),
    }] : []),
    ...(marketData.vix ? [{
      code: "VIX",
      label: "恐慌指数",
      value: getStatus(marketData.vix) === "ok" ? getNumericValue(marketData.vix) : "Unavailable",
      change: getStatus(marketData.vix) === "ok" && marketData.vix.change !== undefined ? Number(marketData.vix.change) : undefined,
      changePercent: getStatus(marketData.vix) === "ok" && marketData.vix.change_percent !== undefined ? Number(marketData.vix.change_percent) : undefined,
      status: getStatus(marketData.vix),
    }] : []),
    ...(marketData.dxy ? [{
      code: "DXY",
      label: "美元指数",
      value: getStatus(marketData.dxy) === "ok" ? getNumericValue(marketData.dxy) : "Unavailable",
      change: getStatus(marketData.dxy) === "ok" && marketData.dxy.change !== undefined ? Number(marketData.dxy.change) : undefined,
      changePercent: getStatus(marketData.dxy) === "ok" && marketData.dxy.change_percent !== undefined ? Number(marketData.dxy.change_percent) : undefined,
      status: getStatus(marketData.dxy),
    }] : []),
  ] : [];

  if (loading) {
    return (
      <div className="bg-card rounded-sm shadow-md border border-border/40 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-sm shadow-md border border-border/40">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <h2 className="text-lg font-mono font-medium text-foreground">指数追踪</h2>
      </div>

      {/* Indices Grid */}
      <div className="p-4">
        {indices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-mono">
            暂无数据
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {indices.map((index) => {
              const isUnavailable = index.status === "unavailable";
              const isOk = index.status === "ok";
              const isPositive = (index.changePercent !== undefined && Number(index.changePercent) >= 0) ||
                (index.change !== undefined && Number(index.change) >= 0);

              return (
                <div
                  key={index.code}
                  className={`p-4 rounded-sm border border-border/30 bg-card/50 ${
                    isUnavailable ? "opacity-75" : ""
                  }`}
                >
                  {/* Label */}
                  <div className="text-xs font-mono text-muted-foreground mb-1">
                    {index.label}
                  </div>

                  {/* Code */}
                  <div className="text-sm font-mono font-medium text-foreground mb-2">
                    {index.code}
                  </div>

                  {isUnavailable ? (
                    <div className="text-xs opacity-60 font-mono">不可用</div>
                  ) : (
                    <>
                      {/* Value */}
                      <div className="text-lg font-mono font-semibold text-foreground tabular-nums">
                        {typeof index.value === "number"
                          ? index.value.toLocaleString()
                          : index.value}
                      </div>

                      {/* Change */}
                      {isOk && (index.change !== undefined || index.changePercent !== undefined) && (
                        <div className="flex items-center gap-1 mt-1">
                          {isPositive ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className={`text-sm font-mono tabular-nums ${
                            isPositive ? "text-green-500" : "text-red-500"
                          }`}>
                            {Number(index.changePercent) >= 0 ? "+" : ""}{Number(index.changePercent).toFixed(2)}%
                          </span>
                          {index.change !== undefined && (
                            <span className={`text-xs font-mono tabular-nums opacity-70 ${
                              isPositive ? "text-green-500/70" : "text-red-500/70"
                            }`}>
                              ({Number(index.change) >= 0 ? "+" : ""}{Number(index.change).toFixed(2)})
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
