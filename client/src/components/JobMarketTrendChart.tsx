import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";

interface TrendPoint {
  date: string;
  layoff: number;
  offer: number;
  startup: number;
}

interface TrendResponse {
  items: TrendPoint[];
  deltas: {
    layoff: number;
    offer: number;
    startup: number;
  };
}

function DeltaChip({ label, value }: { label: string; value: number }) {
  const tone =
    value > 0
      ? "text-emerald-300 border-emerald-400/20 bg-emerald-500/10"
      : value < 0
        ? "text-rose-300 border-rose-400/20 bg-rose-500/10"
        : "text-muted-foreground border-white/10 bg-white/[0.04]";

  const prefix = value > 0 ? "+" : "";

  return (
    <div className={`rounded-full border px-2.5 py-1 text-[11px] ${tone}`}>
      {label} {prefix}
      {value}
    </div>
  );
}

export default function JobMarketTrendChart() {
  const { lang } = useLanguage();
  const [items, setItems] = useState<TrendPoint[]>([]);
  const [deltas, setDeltas] = useState<TrendResponse["deltas"]>({
    layoff: 0,
    offer: 0,
    startup: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`${config.apiBaseUrl}/api/market?handler=job-market-trend&days=7`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) throw new Error(`job market trend ${resp.status}`);
        const data: TrendResponse = await resp.json();
        setItems(data.items || []);
        setDeltas(data.deltas || { layoff: 0, offer: 0, startup: 0 });
      } catch (error) {
        console.error("[JobMarketTrendChart] Failed to fetch trend:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        label: item.date.slice(5),
      })),
    [items],
  );

  const hasSignal = chartData.some((item) => item.layoff || item.offer || item.startup);

  return (
    <section className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {lang === "en" ? "Engineer Job Market Trend" : "码农 Job Market 走势"}
          </h2>
          <div className="mt-1 text-sm text-muted-foreground">
            {lang === "en"
              ? "7-day signal from layoffs, offer flow, and startup coverage"
              : "最近 7 天：裁员、offer 流动、startup 新闻热度"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DeltaChip label={lang === "en" ? "Layoff" : "裁员"} value={deltas.layoff} />
          <DeltaChip label={lang === "en" ? "Offer" : "Offer"} value={deltas.offer} />
          <DeltaChip label={lang === "en" ? "Startup" : "Startup"} value={deltas.startup} />
        </div>
      </div>

      <div className="h-[240px] w-full min-w-0 rounded-[1rem] border border-white/10 bg-white/[0.03] p-3">
        {loading ? (
          <div className="h-full animate-pulse rounded-sm bg-muted/30" />
        ) : !hasSignal ? (
          <div className="flex h-full items-center justify-center rounded-sm text-sm text-muted-foreground">
            {lang === "en"
              ? "No usable signal yet. The feed will appear once recent layoffs, offers, or startup items land."
              : "当前还没有可用走势信号。等最近的裁员、offer 或 startup 新闻进来后这里会自动出现。"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(226,232,240,0.55)", fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={28}
                tick={{ fill: "rgba(226,232,240,0.45)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,23,42,0.95)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "12px",
                }}
              />
              <Line type="monotone" dataKey="layoff" stroke="#f87171" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="offer" stroke="#38bdf8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="startup" stroke="#fbbf24" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
