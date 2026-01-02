/**
 * Data Punk Design: Financial terminal-style overview with REAL-TIME data from Google CSE
 * - Large monospace numbers with neon glow
 * - Green for gains, red for losses
 * - Grid layout for indices
 * - Live data from serverless API (/api/market)
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { generateMarketJudgment, type MarketJudgment } from "@/lib/judgment";
import { config } from "@/config";
import DataStateBadge from "@/components/DataStateBadge";
import SourceLink from "@/components/SourceLink";
import { getSourceInfo, getStatus, getNumericValue } from "@shared/utils";

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  // New standard fields (preferred)
  status?: "ok" | "stale" | "unavailable";
  asOf?: string;
  source?: {
    name: string;
    url: string;
  };
  ttlSeconds?: number;
  error?: string;
  // Legacy fields (for backward compatibility)
  source_name?: string;
  source_url?: string;
  as_of?: string;
}

interface FinanceData {
  stockMarketValue: { value: number; currency: string };
  todayChange: { amount: number; percentage: number };
  totalGainLoss: { amount: number; percentage: number };
  ytd: { percentage: number };
  indices: Array<{
    code: string;
    name: string;
    value: number | string;
    change: number;
    changePercent: number;
    status: "ok" | "stale" | "unavailable";
    source?: string;
    sourceUrl?: string;
    error?: string;
    note?: string;
  }>;
  lastUpdated: string;
}

export default function FinanceOverview() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [judgment, setJudgment] = useState<MarketJudgment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch market data from serverless API
        const response = await fetch(`${config.apiBaseUrl}/api/market`);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }
        
        const result = await response.json();
        const marketData: {
          spy: MarketDataItem;
          gold: MarketDataItem;
          btc: MarketDataItem;
          mortgage: MarketDataItem;
          powerball: MarketDataItem;
        } = result.data;
        
        // Use shared utility functions (imported at top)
        
        // Calculate portfolio value
        const portfolioValue = 150000;
        const spyStatus = getStatus(marketData.spy);
        const spyChangePercent = spyStatus === "ok" ? (marketData.spy.change_percent || 0) : 0;
        const todayChange = portfolioValue * spyChangePercent / 100;
        
        const result2 = {
          stockMarketValue: {
            value: portfolioValue,
            currency: "USD",
          },
          todayChange: {
            amount: Math.round(todayChange),
            percentage: Number(spyChangePercent.toFixed(2)),
          },
          totalGainLoss: {
            amount: Math.round(portfolioValue * 0.15),
            percentage: 15,
          },
          ytd: {
            percentage: 15,
          },
          indices: [
            {
              code: "SPY",
              name: "S&P 500 ETF",
              value: spyStatus === "ok" ? getNumericValue(marketData.spy) : "Unavailable",
              change: spyStatus === "ok" ? Number(marketData.spy.change || 0) : 0,
              changePercent: spyStatus === "ok" ? Number(marketData.spy.change_percent || 0) : 0,
              status: spyStatus,
              source: getSourceInfo(marketData.spy).name,
              sourceUrl: getSourceInfo(marketData.spy).url,
              error: marketData.spy.error,
            },
            {
              code: "GOLD",
              name: "Gold",
              value: getStatus(marketData.gold) === "ok" ? getNumericValue(marketData.gold) : "Unavailable",
              change: getStatus(marketData.gold) === "ok" ? Number(marketData.gold.change || 0) : 0,
              changePercent: getStatus(marketData.gold) === "ok" ? Number(marketData.gold.change_percent || 0) : 0,
              status: getStatus(marketData.gold),
              source: getSourceInfo(marketData.gold).name,
              sourceUrl: getSourceInfo(marketData.gold).url,
              error: marketData.gold.error,
            },
            {
              code: "BTC",
              name: "Bitcoin",
              value: getStatus(marketData.btc) === "ok" ? getNumericValue(marketData.btc) : "Unavailable",
              change: getStatus(marketData.btc) === "ok" ? Number(marketData.btc.change || 0) : 0,
              changePercent: getStatus(marketData.btc) === "ok" ? Number(marketData.btc.change_percent || 0) : 0,
              status: getStatus(marketData.btc),
              source: getSourceInfo(marketData.btc).name,
              sourceUrl: getSourceInfo(marketData.btc).url,
              error: marketData.btc.error,
            },
          ],
          lastUpdated: result.updated_at || result.fetched_at || new Date().toLocaleString(),
        };

        setData(result2);
        
        // Generate market judgment (only if SPY is available)
        const marketJudgment = spyStatus === "ok" ? generateMarketJudgment({
          spyChangePercent: marketData.spy.change_percent || 0,
          portfolioChangePercent: spyChangePercent,
          btcChangePercent: getStatus(marketData.btc) === "ok" ? (marketData.btc.change_percent || 0) : 0,
          goldChangePercent: getStatus(marketData.gold) === "ok" ? (marketData.gold.change_percent || 0) : 0,
        }) : null;
        setJudgment(marketJudgment);
      } catch (error) {
        console.error("Failed to fetch finance overview:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // Refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="glow-border rounded-sm p-6 bg-card">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glow-border rounded-sm p-6 bg-card">
        <div className="text-red-400">Failed to load finance data</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Overview Card */}
      <div className="glow-border rounded-sm p-4 bg-card">
        <h2 className="text-xl font-bold text-primary mb-3 flex items-center gap-2">
          <span className="text-primary">票子</span>
          <span className="text-muted-foreground text-base">| 早日财富自由</span>
        </h2>
        
        {/* Judgment Layer */}
        {judgment && (
            <div className={`mb-4 p-3 rounded-sm border-l-4 ${
            judgment.status === 'positive' ? 'border-green-400 bg-green-400/10' :
            judgment.status === 'negative' ? 'border-red-400 bg-red-400/10' :
            'border-blue-400 bg-blue-400/10'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{judgment.icon}</span>
              <div className="flex-1">
                <div className={`text-base font-medium ${
                  judgment.status === 'positive' ? 'text-green-400' :
                  judgment.status === 'negative' ? 'text-red-400' :
                  'text-blue-400'
                }`}>
                  今日判断
                </div>
                <div className="text-foreground mt-1">
                  {judgment.message}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Stock Market Value */}
          <div className="text-center">
            <div className="text-muted-foreground text-sm mb-1">股票市值</div>
            <div className="text-3xl font-mono font-bold text-foreground">
              ${data.stockMarketValue.value.toLocaleString()}
            </div>
          </div>

          {/* Today's Change */}
          <div className="text-center">
            <div className="text-muted-foreground text-sm mb-1">今日涨跌</div>
            <div
              className={`text-2xl font-mono font-bold flex items-center justify-center gap-1 ${
                data.todayChange.amount >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {data.todayChange.amount >= 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              {data.todayChange.amount >= 0 ? "+" : ""}
              {data.todayChange.amount.toLocaleString()}
            </div>
            <div
              className={`text-sm font-mono ${
                data.todayChange.percentage >= 0
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {data.todayChange.percentage >= 0 ? "+" : ""}
              {data.todayChange.percentage}%
            </div>
          </div>

          {/* Total Gain/Loss */}
          <div className="text-center">
            <div className="text-muted-foreground text-sm mb-1">总浮盈/浮亏</div>
            <div
              className={`text-2xl font-mono font-bold ${
                data.totalGainLoss.amount >= 0
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {data.totalGainLoss.amount >= 0 ? "+" : ""}
              {data.totalGainLoss.amount.toLocaleString()}
            </div>
            <div
              className={`text-sm font-mono ${
                data.totalGainLoss.percentage >= 0
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {data.totalGainLoss.percentage.toFixed(2)}%
            </div>
          </div>

          {/* YTD */}
          <div className="text-center">
            <div className="text-muted-foreground text-sm mb-1">YTD</div>
            <div
              className={`text-2xl font-mono font-bold ${
                data.ytd.percentage >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {data.ytd.percentage >= 0 ? "+" : ""}
              {data.ytd.percentage.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Indices Grid */}
      <div className="grid grid-cols-1 gap-4">
        {data.indices.map((index) => {
          const isUnavailable = index.status === "unavailable";
          const isStale = index.status === "stale";
          const isOk = index.status === "ok";
          
          return (
            <div
              key={index.code}
              className={`glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-colors ${
                isUnavailable ? "opacity-75" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted-foreground">
                  {index.code}
                </div>
                {/* Status badge */}
                <DataStateBadge status={index.status} />
              </div>
              <div className="text-sm font-medium text-foreground mb-2">
                {index.name}
              </div>
              
              {/* Value display - different for unavailable */}
              {isUnavailable ? (
                <div className="space-y-2">
                  <div className="text-lg font-mono font-bold text-muted-foreground">
                    不可用
                  </div>
                  {index.error && (
                    <div className="text-xs text-muted-foreground/70">
                      {index.error}
                    </div>
                  )}
                  <SourceLink
                    name="查看来源"
                    url={index.sourceUrl || "#"}
                    position="card-bottom"
                  />
                </div>
              ) : (
                <>
                  <div className="text-xl font-mono font-bold text-foreground mb-1">
                    {typeof index.value === "number"
                      ? index.value.toLocaleString()
                      : index.value}
                  </div>
                  {isOk && index.change !== 0 && (
                    <div
                      className={`text-xs font-mono flex items-center gap-1 ${
                        index.change >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {index.change >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {index.change >= 0 ? "+" : ""}
                      {index.change} ({index.changePercent >= 0 ? "+" : ""}
                      {index.changePercent}%)
                    </div>
                  )}
                  {isStale && (
                    <div className="text-xs text-yellow-400/70 mt-1">
                      数据可能已过期
                    </div>
                  )}
                </>
              )}
              
              {/* Source link - fixed position bottom-right */}
              {!isUnavailable && (
                <SourceLink
                  name={index.source || ""}
                  url={index.sourceUrl || "#"}
                  position="card-bottom"
                />
              )}
              
              {index.note && (
                <div className="text-xs text-muted-foreground/70 mt-1">
                  {index.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Last Updated Timestamp */}
      <div className="text-xs text-muted-foreground text-right mt-2">
        数据更新于: {data.lastUpdated} PT
      </div>
    </div>
  );
}
