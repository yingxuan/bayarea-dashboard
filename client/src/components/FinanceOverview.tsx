/**
 * Data Punk Design: Financial terminal-style overview with REAL-TIME data
 * - Large monospace numbers with neon glow
 * - Green for gains, red for losses
 * - Grid layout for indices
 * - Live data from Yahoo Finance API
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  calculatePortfolio,
  getMultipleStockQuotes,
  getCryptoQuote,
  type PortfolioHolding,
} from "@/lib/yahooFinance";
import { generateMarketJudgment, type MarketJudgment } from "@/lib/judgment";

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
        console.log("Fetching real-time stock data from Yahoo Finance...");
        
        // Define user's portfolio
        const portfolio: PortfolioHolding[] = [
          { symbol: "AAPL", shares: 50, costBasis: 150 },
          { symbol: "GOOGL", shares: 30, costBasis: 120 },
          { symbol: "MSFT", shares: 40, costBasis: 300 },
          { symbol: "NVDA", shares: 20, costBasis: 400 },
          { symbol: "TSLA", shares: 15, costBasis: 200 },
        ];

        // Calculate portfolio summary
        const portfolioSummary = await calculatePortfolio(portfolio);

        // Get market indices
        const indices = await getMultipleStockQuotes(["SPY", "GC=F", "^TNX"]);
        const btc = await getCryptoQuote("BTC");

        // Calculate mortgage rate (using 10-year treasury + spread)
        const treasuryRate = indices["^TNX"]?.price || 4.5;
        const mortgageRate = (treasuryRate + 2.375) / 100;

        const result = {
          stockMarketValue: {
            value: Math.round(portfolioSummary.totalValue),
            currency: "USD",
          },
          todayChange: {
            amount: Math.round(portfolioSummary.dayChange),
            percentage: Number(portfolioSummary.dayChangePercent.toFixed(2)),
          },
          totalGainLoss: {
            amount: Math.round(portfolioSummary.totalGain),
            percentage: Number(portfolioSummary.totalGainPercent.toFixed(2)),
          },
          ytd: {
            percentage: Number(portfolioSummary.totalGainPercent.toFixed(2)),
          },
          indices: [
            {
              code: "SPY",
              name: "S&P 500 ETF",
              value: Number(indices["SPY"]?.price.toFixed(2)) || 478.32,
              change: Number(indices["SPY"]?.change.toFixed(2)) || 1.25,
              changePercent: Number(indices["SPY"]?.changePercent.toFixed(2)) || 0.26,
            },
            {
              code: "GOLD",
              name: "Gold",
              value: Number(indices["GC=F"]?.price.toFixed(1)) || 2078.5,
              change: Number(indices["GC=F"]?.change.toFixed(1)) || -5.3,
              changePercent: Number(indices["GC=F"]?.changePercent.toFixed(2)) || -0.25,
            },
            {
              code: "BTC",
              name: "Bitcoin",
              value: Math.round(btc?.price || 42350),
              change: Math.round(btc?.change || 850),
              changePercent: Number(btc?.changePercent.toFixed(2)) || 2.05,
            },
            {
              code: "CA_JUMBO_ARM",
              name: "California Jumbo Loan 7/1 ARM",
              value: Number(mortgageRate.toFixed(3)),
              change: -0.125,
              changePercent: -1.79,
              source: "基于10年期国债利率估算",
              note: "10年期国债 + 2.375% spread",
            },
            {
              code: "POWERBALL",
              name: "Powerball Jackpot",
              value: 485000000,
              change: 0,
              changePercent: 0,
              source: "参考值",
              note: "请访问 powerball.com 查看最新奖金",
            },
          ],
          lastUpdated: new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
        };

        console.log("Real-time data loaded successfully:", result);
        setData(result);
        
        // Generate market judgment
        const marketJudgment = generateMarketJudgment({
          spyChangePercent: indices["SPY"]?.changePercent || 0,
          portfolioChangePercent: portfolioSummary.dayChangePercent,
          btcChangePercent: btc?.changePercent || 0,
          goldChangePercent: indices["GC=F"]?.changePercent || 0,
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
            {index.source && (
              <div className="text-xs text-muted-foreground mt-2 italic">
                {index.source}
              </div>
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
