/**
 * Portfolio Summary Component (A)
 * Displays total portfolio value, daily change, and YTD
 */

import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Holding } from "@/hooks/useHoldings";
import { usePortfolioSummary, QuoteData } from "@/hooks/usePortfolioSummary";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "lucide-react";
import HoldingsEditor from "@/components/HoldingsEditor";

interface PortfolioSummaryProps {
  quotesData: Record<string, QuoteData>;
  holdings: Holding[];
  holdingsLoaded: boolean;
  ytdBaseline: number | null;
  onYtdBaselineChange: (value: number | null) => void;
}

export default function PortfolioSummary({
  quotesData,
  holdings,
  holdingsLoaded,
  ytdBaseline,
  onYtdBaselineChange,
}: PortfolioSummaryProps) {
  // Single source of truth: usePortfolioSummary hook
  const portfolioMetrics = usePortfolioSummary(holdings, quotesData, ytdBaseline);

  const [showYtdInput, setShowYtdInput] = useState(false);
  const [ytdInputValue, setYtdInputValue] = useState(ytdBaseline?.toString() || '');

  // Sync input value when ytdBaseline changes externally
  useEffect(() => {
    if (!showYtdInput) {
      setYtdInputValue(ytdBaseline?.toString() || '');
    }
  }, [ytdBaseline, showYtdInput]);

  const handleYtdSubmit = () => {
    const value = parseFloat(ytdInputValue);
    if (!isNaN(value) && value > 0) {
      onYtdBaselineChange(value);
      setShowYtdInput(false);
    } else if (ytdInputValue.trim() === '') {
      onYtdBaselineChange(null);
      setShowYtdInput(false);
    }
  };

  return (
    <div className="glow-border rounded-sm p-3 bg-card">
      {/* ROW 1: Compact horizontal layout */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: 市值 (large number) */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-xs font-mono">市值</span>
          <span className="text-2xl font-mono font-bold text-foreground">
            ${portfolioMetrics.portfolioValue.toLocaleString()}
          </span>
        </div>

        {/* Center: 今日涨跌 ($ + %) */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-xs font-mono">今日涨跌</span>
          <div className="flex items-center gap-1">
            {portfolioMetrics.dailyChangeAmount >= 0 ? (
              <TrendingUp className="w-3 h-3 flex-shrink-0 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 flex-shrink-0 text-red-400" />
            )}
            <span
              className={`text-lg font-mono font-bold ${
                portfolioMetrics.dailyChangeAmount >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : ""}
              ${portfolioMetrics.dailyChangeAmount.toLocaleString()}
            </span>
            <span
              className={`text-sm font-mono ${
                portfolioMetrics.dailyChangePercent >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              ({portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
              {portfolioMetrics.dailyChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Center-right: YTD */}
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-xs font-mono">YTD</span>
          {showYtdInput ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="年初市值"
                value={ytdInputValue}
                onChange={(e) => setYtdInputValue(e.target.value)}
                className="h-6 text-xs w-24"
              />
              <Button size="sm" onClick={handleYtdSubmit} className="text-xs h-6 px-2">
                保存
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                setShowYtdInput(false);
                setYtdInputValue(ytdBaseline?.toString() || '');
              }} className="text-xs h-6 px-2">
                取消
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <div
                className={`text-lg font-mono font-bold ${
                  portfolioMetrics.ytdPercent !== null
                    ? portfolioMetrics.ytdPercent >= 0
                      ? "text-green-400"
                      : "text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {portfolioMetrics.ytdPercent !== null ? (
                  <>
                    {portfolioMetrics.ytdPercent >= 0 ? "+" : ""}
                    {portfolioMetrics.ytdPercent.toFixed(2)}%
                  </>
                ) : (
                  "—"
                )}
              </div>
              <button
                onClick={() => setShowYtdInput(true)}
                className="text-xs text-muted-foreground hover:text-foreground ml-1"
                title="设置年初基准"
              >
                ⚙️
              </button>
            </div>
          )}
        </div>

        {/* Right: 编辑仓位 button */}
        <div className="ml-auto">
          <HoldingsEditor trigger={
            <Button variant="outline" size="sm" className="text-xs h-7">
              <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
            </Button>
          } />
        </div>
      </div>
    </div>
  );
}
