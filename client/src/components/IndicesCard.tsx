/**
 * Indices Card Component
 * 独立的指数卡片，显示 SPY / QQQ / BTC / GOLD / ARKK
 * 紧凑表格布局，信息密度优先
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

export default function IndicesCard() {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
    qqq?: MarketDataItem;
    arkk?: MarketDataItem;
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
        const data: {
          spy: MarketDataItem;
          gold: MarketDataItem;
          btc: MarketDataItem;
          qqq?: MarketDataItem;
          arkk?: MarketDataItem;
        } = result.data;
        
        setMarketData(data);
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

  // Prepare indices data (SPY, QQQ, BTC, GOLD, ARKK)
  const indices = marketData ? [
    {
      code: "大盘 SPY",
      value: getStatus(marketData.spy) === "ok" ? getNumericValue(marketData.spy) : "Unavailable",
      change: getStatus(marketData.spy) === "ok" && marketData.spy.change !== undefined && !isNaN(Number(marketData.spy.change)) ? Number(marketData.spy.change) : undefined,
      changePercent: getStatus(marketData.spy) === "ok" && marketData.spy.change_percent !== undefined && !isNaN(Number(marketData.spy.change_percent)) ? Number(marketData.spy.change_percent) : undefined,
      status: getStatus(marketData.spy),
    },
    ...(marketData.qqq ? [{
      code: "科技股 QQQ",
      value: getStatus(marketData.qqq) === "ok" ? getNumericValue(marketData.qqq) : "Unavailable",
      change: getStatus(marketData.qqq) === "ok" && marketData.qqq.change !== undefined && !isNaN(Number(marketData.qqq.change)) ? Number(marketData.qqq.change) : undefined,
      changePercent: getStatus(marketData.qqq) === "ok" && marketData.qqq.change_percent !== undefined && !isNaN(Number(marketData.qqq.change_percent)) ? Number(marketData.qqq.change_percent) : undefined,
      status: getStatus(marketData.qqq),
    }] : []),
    {
      code: "比特币 BTC",
      value: getStatus(marketData.btc) === "ok" ? getNumericValue(marketData.btc) : "Unavailable",
      change: getStatus(marketData.btc) === "ok" && marketData.btc.change !== undefined && !isNaN(Number(marketData.btc.change)) ? Number(marketData.btc.change) : undefined,
      changePercent: getStatus(marketData.btc) === "ok" && marketData.btc.change_percent !== undefined && !isNaN(Number(marketData.btc.change_percent)) ? Number(marketData.btc.change_percent) : undefined,
      status: getStatus(marketData.btc),
    },
    {
      code: "黄金 GOLD",
      value: getStatus(marketData.gold) === "ok" ? getNumericValue(marketData.gold) : "Unavailable",
      change: getStatus(marketData.gold) === "ok" && marketData.gold.change !== undefined && !isNaN(Number(marketData.gold.change)) ? Number(marketData.gold.change) : undefined,
      changePercent: getStatus(marketData.gold) === "ok" && marketData.gold.change_percent !== undefined && !isNaN(Number(marketData.gold.change_percent)) ? Number(marketData.gold.change_percent) : undefined,
      status: getStatus(marketData.gold),
    },
    ...(marketData.arkk ? [{
      code: "妖股 ARKK",
      value: getStatus(marketData.arkk) === "ok" ? getNumericValue(marketData.arkk) : "Unavailable",
      change: getStatus(marketData.arkk) === "ok" && marketData.arkk.change !== undefined && !isNaN(Number(marketData.arkk.change)) ? Number(marketData.arkk.change) : undefined,
      changePercent: getStatus(marketData.arkk) === "ok" && marketData.arkk.change_percent !== undefined && !isNaN(Number(marketData.arkk.change_percent)) ? Number(marketData.arkk.change_percent) : undefined,
      status: getStatus(marketData.arkk),
    }] : []),
  ] : [];

  return (
    <div className="bg-card rounded-sm shadow-md border border-border/40 h-full flex flex-col">
      {/* CardBody */}
      <div className="p-4 flex flex-col flex-1">
        {/* Header */}
        <div className="mb-2">
          <h4 className="text-[13px] font-mono font-medium text-foreground/80">指数</h4>
        </div>

      {/* Indices Table */}
      {loading || !marketData || indices.length === 0 ? (
        <div className="text-xs opacity-60 font-mono font-normal text-center py-2">
          {loading ? "加载中..." : "暂无数据"}
        </div>
      ) : (
        <div className="space-y-0.5 flex-1" style={{ lineHeight: '1.35' }}>
          {indices.map((index, idx) => {
            const isUnavailable = index.status === "unavailable";
            const isOk = index.status === "ok";
            const isPositive = (index.changePercent !== undefined && Number(index.changePercent) >= 0) || 
                              (index.change !== undefined && Number(index.change) >= 0);
            
            return (
              <div
                key={index.code}
                className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-2 py-0.5 ${
                  isUnavailable ? "opacity-75" : ""
                } ${idx < indices.length - 1 ? 'border-b border-border/30' : ''}`}
              >
                {/* Ticker (左对齐，固定宽) */}
                <div className="text-[14px] font-medium font-mono text-foreground w-20">
                  {index.code}
                </div>
                {/* Price (右对齐，tabular-nums) */}
                {isUnavailable ? (
                  <div className="text-xs opacity-60 font-mono font-normal text-right col-span-2">
                    不可用
                  </div>
                ) : (
                  <>
                    <div className="text-[14px] font-medium font-mono text-foreground text-right tabular-nums">
                      {typeof index.value === "number"
                        ? index.value.toLocaleString()
                        : index.value}
                    </div>
                    {/* Pct (右对齐，tabular-nums，紧贴数字) */}
                    {isOk && (index.change !== undefined || index.changePercent !== undefined) && (
                      <div className="flex items-center gap-0 justify-end">
                        {isPositive ? (
                          <TrendingUp className="w-2.5 h-2.5 mr-0.5 text-green-500/70" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-red-500/70" />
                        )}
                        <span className={`text-[14px] font-medium font-mono tabular-nums ${
                          isPositive ? "text-green-500/70" : "text-red-500/70"
                        }`}>
                          {Number(index.changePercent) >= 0 ? "+" : ""}{Number(index.changePercent).toFixed(2)}%
                        </span>
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
