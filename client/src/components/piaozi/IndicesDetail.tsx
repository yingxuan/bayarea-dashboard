import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { config } from "@/config";
import { getNumericValue, getStatus } from "@shared/utils";

interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  status?: "ok" | "stale" | "unavailable";
}

interface IndexData {
  code: string;
  label: string;
  value: number | string;
  change?: number;
  changePercent?: number;
  status: string;
}

export default function IndicesDetail() {
  const [marketData, setMarketData] = useState<{
    spy: MarketDataItem;
    gold: MarketDataItem;
    btc: MarketDataItem;
    qqq?: MarketDataItem;
    arkk?: MarketDataItem;
    vix?: MarketDataItem;
    dxy?: MarketDataItem;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${config.apiBaseUrl}/api/market`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        setMarketData(result.data);
      } catch (error) {
        console.error("[IndicesDetail] Failed to fetch market data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const indices: IndexData[] = marketData
    ? [
        {
          code: "SPY",
          label: "大盘 S&P 500",
          value: getStatus(marketData.spy) === "ok" ? getNumericValue(marketData.spy) : "Unavailable",
          change:
            getStatus(marketData.spy) === "ok" && marketData.spy.change !== undefined
              ? Number(marketData.spy.change)
              : undefined,
          changePercent:
            getStatus(marketData.spy) === "ok" && marketData.spy.change_percent !== undefined
              ? Number(marketData.spy.change_percent)
              : undefined,
          status: getStatus(marketData.spy),
        },
        ...(marketData.qqq
          ? [
              {
                code: "QQQ",
                label: "科技股 纳斯达克",
                value:
                  getStatus(marketData.qqq) === "ok" ? getNumericValue(marketData.qqq) : "Unavailable",
                change:
                  getStatus(marketData.qqq) === "ok" && marketData.qqq.change !== undefined
                    ? Number(marketData.qqq.change)
                    : undefined,
                changePercent:
                  getStatus(marketData.qqq) === "ok" && marketData.qqq.change_percent !== undefined
                    ? Number(marketData.qqq.change_percent)
                    : undefined,
                status: getStatus(marketData.qqq),
              },
            ]
          : []),
        {
          code: "BTC",
          label: "比特币",
          value: getStatus(marketData.btc) === "ok" ? getNumericValue(marketData.btc) : "Unavailable",
          change:
            getStatus(marketData.btc) === "ok" && marketData.btc.change !== undefined
              ? Number(marketData.btc.change)
              : undefined,
          changePercent:
            getStatus(marketData.btc) === "ok" && marketData.btc.change_percent !== undefined
              ? Number(marketData.btc.change_percent)
              : undefined,
          status: getStatus(marketData.btc),
        },
        {
          code: "GOLD",
          label: "黄金",
          value:
            getStatus(marketData.gold) === "ok" ? getNumericValue(marketData.gold) : "Unavailable",
          change:
            getStatus(marketData.gold) === "ok" && marketData.gold.change !== undefined
              ? Number(marketData.gold.change)
              : undefined,
          changePercent:
            getStatus(marketData.gold) === "ok" && marketData.gold.change_percent !== undefined
              ? Number(marketData.gold.change_percent)
              : undefined,
          status: getStatus(marketData.gold),
        },
        ...(marketData.arkk
          ? [
              {
                code: "ARKK",
                label: "妖股 ARK",
                value:
                  getStatus(marketData.arkk) === "ok" ? getNumericValue(marketData.arkk) : "Unavailable",
                change:
                  getStatus(marketData.arkk) === "ok" && marketData.arkk.change !== undefined
                    ? Number(marketData.arkk.change)
                    : undefined,
                changePercent:
                  getStatus(marketData.arkk) === "ok" && marketData.arkk.change_percent !== undefined
                    ? Number(marketData.arkk.change_percent)
                    : undefined,
                status: getStatus(marketData.arkk),
              },
            ]
          : []),
        ...(marketData.vix
          ? [
              {
                code: "VIX",
                label: "恐慌指数",
                value:
                  getStatus(marketData.vix) === "ok" ? getNumericValue(marketData.vix) : "Unavailable",
                change:
                  getStatus(marketData.vix) === "ok" && marketData.vix.change !== undefined
                    ? Number(marketData.vix.change)
                    : undefined,
                changePercent:
                  getStatus(marketData.vix) === "ok" && marketData.vix.change_percent !== undefined
                    ? Number(marketData.vix.change_percent)
                    : undefined,
                status: getStatus(marketData.vix),
              },
            ]
          : []),
        ...(marketData.dxy
          ? [
              {
                code: "DXY",
                label: "美元指数",
                value:
                  getStatus(marketData.dxy) === "ok" ? getNumericValue(marketData.dxy) : "Unavailable",
                change:
                  getStatus(marketData.dxy) === "ok" && marketData.dxy.change !== undefined
                    ? Number(marketData.dxy.change)
                    : undefined,
                changePercent:
                  getStatus(marketData.dxy) === "ok" && marketData.dxy.change_percent !== undefined
                    ? Number(marketData.dxy.change_percent)
                    : undefined,
                status: getStatus(marketData.dxy),
              },
            ]
          : []),
      ]
    : [];

  if (loading) {
    return (
      <div className="section-shell section-shell-market rounded-sm p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-1/4 rounded bg-muted" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-shell section-shell-market rounded-sm">
      <div className="border-b border-border/30 p-5">
        <div className="eyebrow mb-2">Indices</div>
        <h2 className="text-xl font-semibold text-cyan-300/90">指数追踪</h2>
        <p className="mt-1 text-sm text-muted-foreground/72">
          用几组核心指数快速建立今天的市场背景。
        </p>
      </div>

      <div className="p-5">
        {indices.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">暂无数据</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {indices.map((index) => {
              const isUnavailable = index.status === "unavailable";
              const isOk = index.status === "ok";
              const isPositive =
                (index.changePercent !== undefined && Number(index.changePercent) >= 0) ||
                (index.change !== undefined && Number(index.change) >= 0);

              return (
                <div
                  key={index.code}
                  className={`rounded-sm border border-border/35 bg-card/45 p-4 ${
                    isUnavailable ? "opacity-75" : ""
                  }`}
                >
                  <div className="text-xs font-mono text-muted-foreground">{index.label}</div>
                  <div className="mt-1 text-[13px] font-medium font-mono text-foreground">
                    {index.code}
                  </div>

                  {isUnavailable ? (
                    <div className="mt-3 text-xs font-mono text-muted-foreground/65">不可用</div>
                  ) : (
                    <>
                      <div className="mt-3 text-2xl font-semibold font-mono tabular-nums text-foreground">
                        {typeof index.value === "number" ? index.value.toLocaleString() : index.value}
                      </div>
                      {isOk && (index.change !== undefined || index.changePercent !== undefined) && (
                        <div className="mt-2 flex items-center gap-1">
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-rose-400" />
                          )}
                          <span
                            className={`text-sm font-mono tabular-nums ${
                              isPositive ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {Number(index.changePercent) >= 0 ? "+" : ""}
                            {Number(index.changePercent).toFixed(2)}%
                          </span>
                          {index.change !== undefined && (
                            <span
                              className={`text-xs font-mono tabular-nums opacity-75 ${
                                isPositive ? "text-emerald-400/80" : "text-rose-400/80"
                              }`}
                            >
                              ({Number(index.change) >= 0 ? "+" : ""}
                              {Number(index.change).toFixed(2)})
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
    </div>
  );
}
