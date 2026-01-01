/**
 * Data Punk Design: Job Market Temperature Indicator
 * - Shows market temperature (cold/normal/hot)
 * - Displays judgment message and risk warning
 * - Uses rule-based logic to calculate temperature
 */

import { useEffect, useState } from "react";
import { Thermometer, AlertTriangle, TrendingUp } from "lucide-react";
import { generateJobMarketJudgment, type JobMarketJudgment } from "@/lib/judgment";

interface JobMarketTemperatureProps {
  layoffCount?: number;
  hiringCount?: number;
  spyChangePercent?: number;
}

export default function JobMarketTemperature({
  layoffCount = 2,
  hiringCount = 5,
  spyChangePercent = 0.26,
}: JobMarketTemperatureProps) {
  const [judgment, setJudgment] = useState<JobMarketJudgment | null>(null);

  useEffect(() => {
    // Determine tech stock trend based on SPY
    let techStockTrend: 'up' | 'down' | 'flat';
    if (spyChangePercent > 0.5) {
      techStockTrend = 'up';
    } else if (spyChangePercent < -0.5) {
      techStockTrend = 'down';
    } else {
      techStockTrend = 'flat';
    }

    // Generate judgment
    const result = generateJobMarketJudgment({
      layoffCount,
      hiringCount,
      techStockTrend,
      spyChangePercent,
    });

    console.log("Job market judgment:", result);
    setJudgment(result);
  }, [layoffCount, hiringCount, spyChangePercent]);

  if (!judgment) {
    return (
      <div className="glow-border rounded-sm p-6 bg-card">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  // Temperature color mapping
  const temperatureColor =
    judgment.temperature === 'hot'
      ? 'text-red-400'
      : judgment.temperature === 'cold'
      ? 'text-blue-400'
      : 'text-yellow-400';

  const temperatureBg =
    judgment.temperature === 'hot'
      ? 'bg-red-400/10 border-red-400'
      : judgment.temperature === 'cold'
      ? 'bg-blue-400/10 border-blue-400'
      : 'bg-yellow-400/10 border-yellow-400';

  return (
    <div className="glow-border rounded-sm p-6 bg-card">
      <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-2">
        <span className="text-primary">包裹</span>
        <span className="text-muted-foreground text-base">| 就业市场温度</span>
      </h2>

      {/* Temperature Indicator */}
      <div className={`mb-6 p-6 rounded-sm border-2 ${temperatureBg}`}>
        <div className="flex items-center gap-4 mb-4">
          <Thermometer className={`w-12 h-12 ${temperatureColor}`} />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mb-1">市场温度</div>
            <div className={`text-3xl font-bold ${temperatureColor}`}>
              {judgment.temperatureLabel}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {judgment.temperatureScore}/100
            </div>
          </div>
          <div className="text-6xl">{judgment.icon}</div>
        </div>

        {/* Temperature Bar */}
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              judgment.temperature === 'hot'
                ? 'bg-red-400'
                : judgment.temperature === 'cold'
                ? 'bg-blue-400'
                : 'bg-yellow-400'
            }`}
            style={{ width: `${judgment.temperatureScore}%` }}
          />
        </div>
      </div>

      {/* Judgment Message */}
      <div className="mb-4 p-4 rounded-sm bg-primary/10 border-l-4 border-primary">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-primary mb-1">今日判断</div>
            <div className="text-foreground">{judgment.message}</div>
          </div>
        </div>
      </div>

      {/* Risk Warning */}
      <div className="p-4 rounded-sm bg-yellow-400/10 border-l-4 border-yellow-400">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-yellow-400 mb-1">
              风险提示
            </div>
            <div className="text-foreground">{judgment.riskWarning}</div>
          </div>
        </div>
      </div>

      {/* Market Indicators (Optional) */}
      <div className="mt-6 pt-6 border-t border-border">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1">招聘动态</div>
            <div className="text-foreground font-mono">
              {hiringCount} 条招聘新闻
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1">裁员动态</div>
            <div className="text-foreground font-mono">
              {layoffCount} 条裁员新闻
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
