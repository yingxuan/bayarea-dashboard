/**
 * Market Highlights Component
 * Combines 市场快照 (Market Snapshot) and 市场要闻 (Market News) into one section
 * Desktop: 3 columns (快照 / 可选板块or解释 / 要闻bullets)
 * Mobile: Vertical stack (快照 chips -> bullets)
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

interface MarketHighlightsProps {
  marketNews: any[];
}

export default function MarketHighlights({ marketNews }: MarketHighlightsProps) {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch market data (same as FinanceOverview)
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
        } = result.data;
        
        setMarketData(data);
      } catch (error) {
        console.error("[MarketHighlights] Failed to fetch market data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Prepare indices data (SPY, GOLD, BTC) for market snapshot
  const indices = marketData ? [
    {
      code: "SPY",
      value: getStatus(marketData.spy) === "ok" ? getNumericValue(marketData.spy) : "Unavailable",
      change: getStatus(marketData.spy) === "ok" && marketData.spy.change !== undefined && !isNaN(Number(marketData.spy.change)) ? Number(marketData.spy.change) : undefined,
      changePercent: getStatus(marketData.spy) === "ok" && marketData.spy.change_percent !== undefined && !isNaN(Number(marketData.spy.change_percent)) ? Number(marketData.spy.change_percent) : undefined,
      status: getStatus(marketData.spy),
    },
    {
      code: "GOLD",
      value: getStatus(marketData.gold) === "ok" ? getNumericValue(marketData.gold) : "Unavailable",
      change: getStatus(marketData.gold) === "ok" && marketData.gold.change !== undefined && !isNaN(Number(marketData.gold.change)) ? Number(marketData.gold.change) : undefined,
      changePercent: getStatus(marketData.gold) === "ok" && marketData.gold.change_percent !== undefined && !isNaN(Number(marketData.gold.change_percent)) ? Number(marketData.gold.change_percent) : undefined,
      status: getStatus(marketData.gold),
    },
    {
      code: "BTC",
      value: getStatus(marketData.btc) === "ok" ? getNumericValue(marketData.btc) : "Unavailable",
      change: getStatus(marketData.btc) === "ok" && marketData.btc.change !== undefined && !isNaN(Number(marketData.btc.change)) ? Number(marketData.btc.change) : undefined,
      changePercent: getStatus(marketData.btc) === "ok" && marketData.btc.change_percent !== undefined && !isNaN(Number(marketData.btc.change_percent)) ? Number(marketData.btc.change_percent) : undefined,
      status: getStatus(marketData.btc),
    },
  ] : [];

  return (
    <div className="rounded-sm p-3 md:p-4 bg-card border border-border/40 shadow-md">
      {/* Desktop: 2 columns (快照表 + 要闻列表), Mobile: vertical stack */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
        {/* Column 1: 市场快照表（ticker/price/pct 三列，price/pct 右对齐，tabular-nums） */}
        <div className="min-w-0">
          {loading || !marketData || indices.length === 0 ? (
            <div className="text-xs opacity-70 font-mono text-center py-2">
              {loading ? "加载中..." : "暂无数据"}
            </div>
          ) : (
            <div className="space-y-1">
              {indices.map((index, idx) => {
                const isUnavailable = index.status === "unavailable";
                const isOk = index.status === "ok";
                const isPositive = (index.changePercent !== undefined && Number(index.changePercent) >= 0) || 
                                  (index.change !== undefined && Number(index.change) >= 0);
                
                return (
                  <div
                    key={index.code}
                    className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-2 py-1 ${
                      isUnavailable ? "opacity-75" : ""
                    } ${idx < indices.length - 1 ? 'border-b border-border/30' : ''}`}
                  >
                    {/* Ticker (左对齐) */}
                    <div className="text-xs font-medium font-mono text-foreground w-12">
                      {index.code}
                    </div>
                    {/* Price (右对齐，tabular-nums) */}
                    {isUnavailable ? (
                      <div className="text-xs opacity-70 font-mono text-right">
                        不可用
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-mono font-bold text-foreground text-right tabular-nums">
                          {typeof index.value === "number"
                            ? index.value.toLocaleString()
                            : index.value}
                        </div>
                        {/* Pct (右对齐，tabular-nums) */}
                        {isOk && (index.change !== undefined || index.changePercent !== undefined) && (
                          <div
                            className={`text-xs font-medium font-mono flex items-center gap-0.5 justify-end tabular-nums ${
                              isPositive ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-2.5 h-2.5" />
                            ) : (
                              <TrendingDown className="w-2.5 h-2.5" />
                            )}
                            {index.changePercent !== undefined && !isNaN(Number(index.changePercent)) && Number(index.changePercent) !== 0 && (
                              <span>
                                {Number(index.changePercent) >= 0 ? "+" : ""}{Number(index.changePercent).toFixed(2)}%
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

        {/* Column 2: 市场要闻列表（3条，line-clamp-2） */}
        <div className="min-w-0 md:border-l md:border-border/30 md:pl-4">
          {marketNews.length > 0 ? (
            <div className="space-y-1">
              {marketNews.slice(0, 3).map((item: any, index: number) => (
                <a
                  key={index}
                  href={item.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block py-1 hover:bg-card/80 transition-all group rounded-sm ${
                    index < marketNews.length - 1 ? 'border-b border-border/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-1">
                    <span className="text-primary mt-0.5 text-xs flex-shrink-0">•</span>
                    <span className="text-sm font-mono text-foreground/80 group-hover:text-primary transition-colors line-clamp-2 leading-tight flex-1">
                      {item.title || item.title_zh || item.title_en || 'Market News'}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-xs opacity-70 font-mono text-center py-2">
              暂无市场要闻
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
