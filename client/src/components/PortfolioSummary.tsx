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
    <div className="glow-border rounded-sm p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-primary flex items-center gap-2">
          <span className="text-primary">我的持仓总览</span>
        </h2>
        <HoldingsEditor trigger={
          <Button variant="outline" size="sm" className="text-xs">
            <PencilIcon className="w-3 h-3 mr-1" /> 编辑仓位
          </Button>
        } />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Portfolio Value */}
        <div className="text-center flex flex-col min-h-[80px]">
          <div className="text-muted-foreground text-sm mb-2">市值</div>
          <div className="text-2xl xl:text-3xl font-mono font-bold text-foreground leading-tight">
            ${portfolioMetrics.portfolioValue.toLocaleString()}
          </div>
        </div>

        {/* Daily Change */}
        <div className="text-center flex flex-col min-h-[80px]">
          <div className="text-muted-foreground text-sm mb-2">今日涨跌</div>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`text-xl xl:text-2xl font-mono font-bold flex items-center justify-center gap-1 leading-tight ${
                portfolioMetrics.dailyChangeAmount >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {portfolioMetrics.dailyChangeAmount >= 0 ? (
                <TrendingUp className="w-4 h-4 xl:w-5 xl:h-5 flex-shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 xl:w-5 xl:h-5 flex-shrink-0" />
              )}
              <span className="whitespace-nowrap">
                {portfolioMetrics.dailyChangeAmount >= 0 ? "+" : ""}
                ${portfolioMetrics.dailyChangeAmount.toLocaleString()}
              </span>
            </div>
            <div
              className={`text-xs xl:text-sm font-mono leading-tight ${
                portfolioMetrics.dailyChangePercent >= 0
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {portfolioMetrics.dailyChangePercent >= 0 ? "+" : ""}
              {portfolioMetrics.dailyChangePercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* YTD */}
        <div className="text-center flex flex-col min-h-[80px]">
          <div className="text-muted-foreground text-sm mb-2 flex items-center justify-center gap-1">
            YTD
            {!showYtdInput && (
              <button
                onClick={() => setShowYtdInput(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="设置年初基准"
              >
                ⚙️
              </button>
            )}
          </div>
          {showYtdInput ? (
            <div className="flex flex-col gap-2">
              <Input
                type="number"
                placeholder="年初市值"
                value={ytdInputValue}
                onChange={(e) => setYtdInputValue(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={handleYtdSubmit} className="text-xs h-6">
                  保存
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setShowYtdInput(false);
                  setYtdInputValue(ytdBaseline?.toString() || '');
                }} className="text-xs h-6">
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`text-xl xl:text-2xl font-mono font-bold leading-tight ${
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
          )}
        </div>
      </div>
    </div>
  );
}
