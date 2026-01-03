/**
 * Compact Market Temperature Component
 * Displays SPY, GOLD, BTC in condensed single-line format
 */

import { TrendingUp, TrendingDown } from "lucide-react";

interface MarketTemperatureCompactProps {
  spy: {
    value: number | string;
    change?: number;
    changePercent?: number;
    status: "ok" | "stale" | "unavailable";
  };
  gold: {
    value: number | string;
    change?: number;
    changePercent?: number;
    status: "ok" | "stale" | "unavailable";
  };
  btc: {
    value: number | string;
    change?: number;
    changePercent?: number;
    status: "ok" | "stale" | "unavailable";
  };
}

export default function MarketTemperatureCompact({ spy, gold, btc }: MarketTemperatureCompactProps) {
  const indices = [
    { code: "SPY", data: spy },
    { code: "GOLD", data: gold },
    { code: "BTC", data: btc },
  ];

  return (
    <div className="glow-border rounded-sm p-2 bg-card">
      <h3 className="text-sm font-semibold font-mono mb-2 text-foreground/90">
        市场温度
      </h3>
      <div className="space-y-1">
        {indices.map((index) => {
          const isUnavailable = index.data.status === "unavailable";
          const isOk = index.data.status === "ok";
          
          return (
            <div
              key={index.code}
              className={`flex items-center justify-between py-0.5 ${
                isUnavailable ? "opacity-75" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono text-muted-foreground w-10">
                  {index.code}
                </div>
                {isUnavailable ? (
                  <div className="text-xs font-mono text-muted-foreground">
                    不可用
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-mono font-bold text-foreground">
                      {typeof index.data.value === "number"
                        ? index.data.value.toLocaleString()
                        : index.data.value}
                    </div>
                    {isOk && index.data.change !== undefined && index.data.change !== 0 && !isNaN(Number(index.data.change)) && (
                      <div
                        className={`text-xs font-mono flex items-center gap-0.5 ${
                          Number(index.data.change) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {Number(index.data.change) >= 0 ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {Number(index.data.change) >= 0 ? "+" : ""}
                        {typeof index.data.change === 'number' ? index.data.change.toFixed(2) : index.data.change}
                        {index.data.changePercent !== undefined && !isNaN(Number(index.data.changePercent)) && (
                          <span className="ml-0.5">
                            ({Number(index.data.changePercent) >= 0 ? "+" : ""}{Number(index.data.changePercent).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
