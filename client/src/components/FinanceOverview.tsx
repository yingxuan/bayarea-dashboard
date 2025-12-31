/**
 * Data Punk Design: Financial terminal-style overview
 * - Large monospace numbers with neon glow
 * - Green for gains, red for losses
 * - Grid layout for indices
 */

import { useEffect, useState } from "react";
import { mockFinanceOverview } from "@/lib/mockData";
import { TrendingUp, TrendingDown } from "lucide-react";

interface FinanceData {
  stockMarketValue: { value: number; currency: string };
  todayChange: { amount: number; percentage: number };
  totalUnrealizedGainLoss: { amount: number; percentage: number };
  ytdPercentage: number;
  indices: Array<{
    symbol: string;
    name: string;
    value: number;
    change: number;
    changePercent: number;
  }>;
  lastUpdated: string;
}

export default function FinanceOverview() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load mock data (in production, this would be an API call)
    setData(mockFinanceOverview);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="glow-border rounded-sm p-6 bg-card">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-16 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isPositive = data.todayChange?.amount >= 0;

  return (
    <div className="space-y-6">
      {/* Main Overview */}
      <div className="glow-border rounded-sm p-6 bg-card">
        <h2 className="text-lg font-bold font-mono mb-6 flex items-center gap-2">
          <span className="neon-text-blue">票子</span>
          <span className="text-muted-foreground text-sm">| 早日财富自由</span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Stock Market Value */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-mono">
              股票市值
            </div>
            <div className="text-2xl font-bold font-mono">
              ${data.stockMarketValue?.value?.toLocaleString() || '0'}
            </div>
          </div>

          {/* Today's Change */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-mono">
              今日涨跌
            </div>
            <div
              className={`text-2xl font-bold font-mono flex items-center gap-1 ${
                isPositive ? "neon-text-green" : "neon-text-red"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              <span>
                {isPositive ? "+" : ""}
                {data.todayChange?.amount?.toLocaleString() || '0'}
              </span>
            </div>
            <div
              className={`text-sm font-mono ${
                isPositive ? "text-green-400" : "text-red-400"
              }`}
            >
              {isPositive ? "+" : ""}
              {data.todayChange?.percentage?.toFixed(2) || '0.00'}%
            </div>
          </div>

          {/* Total Unrealized Gain/Loss */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-mono">
              总浮盈/浮亏
            </div>
            <div
              className={`text-2xl font-bold font-mono ${
                (data.totalUnrealizedGainLoss?.amount || 0) >= 0
                  ? "neon-text-green"
                  : "neon-text-red"
              }`}
            >
              {(data.totalUnrealizedGainLoss?.amount || 0) >= 0 ? "+" : ""}
              {data.totalUnrealizedGainLoss?.amount?.toLocaleString() || '0'}
            </div>
            <div
              className={`text-sm font-mono ${
                (data.totalUnrealizedGainLoss?.amount || 0) >= 0
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {data.totalUnrealizedGainLoss?.percentage?.toFixed(2) || '0.00'}%
            </div>
          </div>

          {/* YTD */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-mono">
              YTD
            </div>
            <div
              className={`text-2xl font-bold font-mono ${
                (data.ytdPercentage || 0) >= 0 ? "neon-text-green" : "neon-text-red"
              }`}
            >
              {(data.ytdPercentage || 0) >= 0 ? "+" : ""}
              {data.ytdPercentage?.toFixed(2) || '0.00'}%
            </div>
          </div>
        </div>
      </div>

      {/* Indices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {(data.indices || []).map((index) => {
          const isUp = index.change >= 0;
          return (
            <div
              key={index.symbol}
              className="glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-colors"
            >
              <div className="text-xs text-muted-foreground mb-1 font-mono">
                {index.symbol}
              </div>
              <div className="text-sm text-foreground/80 mb-2 truncate">
                {index.name}
              </div>
              <div className="text-xl font-bold font-mono mb-1">
                {index.value.toLocaleString()}
              </div>
              <div
                className={`text-sm font-mono flex items-center gap-1 ${
                  isUp ? "text-green-400" : "text-red-400"
                }`}
              >
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>
                  {isUp ? "+" : ""}
                  {index.change.toLocaleString()}
                </span>
                <span className="text-xs">
                  ({isUp ? "+" : ""}
                  {index.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
