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

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  source_name: string;
  source_url: string;
}

interface FinanceData {
  stockMarketValue: { value: number; currency: string };
  todayChange: { amount: number; percentage: number };
  totalGainLoss: { amount: number; percentage: number };
  ytd: { percentage: number };
  indices: Array<{
    code: string;
    name: string;
    value: number;
    change: number;
    changePercent: number;
    source?: string;
    sourceUrl?: string;
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
        console.log("[FinanceOverview] Fetching market data from serverless API...");
        
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
        
        console.log("Market data received:", marketData);
        
        // Calculate portfolio value (mock for now)
        const portfolioValue = 150000;
        const spyChangePercent = marketData.spy.change_percent || 0;
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
              value: Number(marketData.spy.value),
              change: Number(marketData.spy.change || 0),
              changePercent: Number(marketData.spy.change_percent || 0),
              source: marketData.spy.source_name,
              sourceUrl: marketData.spy.source_url,
            },
            {
              code: "GOLD",
              name: "Gold",
              value: Number(marketData.gold.value),
              change: Number(marketData.gold.change || 0),
              changePercent: Number(marketData.gold.change_percent || 0),
              source: marketData.gold.source_name,
              sourceUrl: marketData.gold.source_url,
            },
            {
              code: "BTC",
              name: "Bitcoin",
              value: Number(marketData.btc.value),
              change: Number(marketData.btc.change || 0),
              changePercent: Number(marketData.btc.change_percent || 0),
              source: marketData.btc.source_name,
              sourceUrl: marketData.btc.source_url,
            },
            {
              code: "CA_JUMBO_ARM",
              name: "California Jumbo Loan 7/1 ARM",
              value: Number(marketData.mortgage.value),
              change: 0,
              changePercent: 0,
              source: marketData.mortgage.source_name,
              sourceUrl: marketData.mortgage.source_url,
              note: "基于最新公布利率",
            },
            {
              code: "POWERBALL",
              name: "Powerball Jackpot",
              value: Number(marketData.powerball.value),
              change: 0,
              changePercent: 0,
              source: marketData.powerball.source_name,
              sourceUrl: marketData.powerball.source_url,
            },
          ],
          lastUpdated: result.updated_at,
        };

        console.log("Finance data processed:", result2);
        setData(result2);
        
        // Generate market judgment
        const marketJudgment = generateMarketJudgment({
          spyChangePercent: marketData.spy.change_percent || 0,
          portfolioChangePercent: spyChangePercent,
          btcChangePercent: marketData.btc.change_percent || 0,
          goldChangePercent: marketData.gold.change_percent || 0,
        });
        console.log("Market judgment:", marketJudgment);
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
      <div className="glow-border rounded-sm p-6 bg-card">
        <h2 className="text-2xl font-bold text-primary mb-4 flex items-center gap-2">
          <span className="text-primary">票子</span>
          <span className="text-muted-foreground text-base">| 早日财富自由</span>
        </h2>
        
        {/* Judgment Layer */}
        {judgment && (
          <div className={`mb-6 p-4 rounded-sm border-l-4 ${
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {data.indices.map((index) => (
          <div
            key={index.code}
            className="glow-border rounded-sm p-4 bg-card hover:bg-card/80 transition-colors"
          >
            <div className="text-xs text-muted-foreground mb-1">
              {index.code}
            </div>
            <div className="text-sm font-medium text-foreground mb-2">
              {index.name}
            </div>
            <div className="text-xl font-mono font-bold text-foreground mb-1">
              {index.value.toLocaleString()}
            </div>
            {index.change !== 0 && (
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
            {index.source && index.sourceUrl && (
              <a
                href={index.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 mt-2 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                {index.source}
              </a>
            )}
            {index.note && (
              <div className="text-xs text-muted-foreground/70 mt-1">
                {index.note}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Last Updated Timestamp */}
      <div className="text-xs text-muted-foreground text-right mt-2">
        数据更新于: {data.lastUpdated} PT
      </div>
    </div>
  );
}
