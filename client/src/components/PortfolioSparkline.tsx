import { useMemo } from "react";

interface ValueDataPoint {
  t: string;
  v: number;
}

interface ModulePayload<T> {
  source: "live" | "cache" | "seed";
  status: "ok" | "degraded" | "failed";
  fetchedAt: string;
  ttlSeconds: number;
  note?: string;
  items: T[];
}

interface PortfolioSparklineProps {
  data: ModulePayload<ValueDataPoint> | null;
  currentValue: number;
  dailyChangePercent: number;
  width?: number;
  height?: number;
}

function formatClockLabel(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function PortfolioSparkline({
  data,
  currentValue,
  dailyChangePercent,
  width = 200,
  height = 40,
}: PortfolioSparklineProps) {
  const sparkline = useMemo(() => {
    const rawItems = data?.items;
    const points = Array.isArray(rawItems)
      ? rawItems.filter(
          (point) =>
            point &&
            typeof point.v === "number" &&
            Number.isFinite(point.v) &&
            typeof point.t === "string" &&
            point.t.length > 0,
        )
      : [];

    let statusText = "";
    if (!data || points.length === 0) {
      statusText = "暂无日内数据";
    } else if (points.length < 2) {
      statusText = "日内数据不足";
    } else if (data.status === "failed") {
      statusText = "日内曲线拉取失败";
    } else if (data.source === "seed") {
      statusText = data.note || "使用缓存数据";
    } else if (data.status === "degraded") {
      statusText = "数据延迟";
    }

    if (points.length < 2) {
      return {
        hasChart: false,
        pathData: "",
        areaPathData: "",
        baselineY: height / 2,
        color: dailyChangePercent >= 0 ? "#4ade80" : "#f87171",
        fillColor: dailyChangePercent >= 0 ? "#4ade80" : "#f87171",
        statusText,
        startLabel: "",
        endLabel: "",
        rangeLabel: "",
      };
    }

    const isPositive = dailyChangePercent >= 0;
    const lineColor = isPositive ? "#4ade80" : "#f87171";
    const fillColor = isPositive ? "#4ade80" : "#f87171";
    const values = points.map((p) => p.v);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const openingValue = points[0]?.v ?? currentValue;
    const paddedMin = Math.min(minValue, openingValue);
    const paddedMax = Math.max(maxValue, openingValue);
    const valueRange = paddedMax - paddedMin || Math.max(Math.abs(openingValue) * 0.0025, 1);
    const topPadding = height * 0.12;
    const usableHeight = height * 0.76;

    const normalizeY = (value: number) =>
      height - ((value - paddedMin) / valueRange) * usableHeight - topPadding;

    const pathPoints: string[] = [];
    const areaPoints: string[] = [];

    points.forEach((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = normalizeY(point.v);

      if (index === 0) {
        pathPoints.push(`M ${x} ${y}`);
        areaPoints.push(`M ${x} ${height}`, `L ${x} ${y}`);
      } else {
        pathPoints.push(`L ${x} ${y}`);
        areaPoints.push(`L ${x} ${y}`);
      }
    });

    areaPoints.push(`L ${width} ${height} Z`);

    return {
      hasChart: true,
      pathData: pathPoints.join(" "),
      areaPathData: areaPoints.join(" "),
      baselineY: normalizeY(openingValue),
      color: lineColor,
      fillColor,
      statusText,
      startLabel: formatClockLabel(points[0]?.t),
      endLabel: formatClockLabel(points[points.length - 1]?.t),
      rangeLabel: `${minValue.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })} - ${maxValue.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`,
    };
  }, [currentValue, dailyChangePercent, data, height, width]);

  const gradientId = useMemo(() => `sparkline-fill-${Math.random().toString(36).slice(2, 9)}`, []);

  if (!sparkline.hasChart) {
    return (
      <div className="flex h-full min-h-[108px] flex-col justify-between rounded-[0.9rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="text-[11px] font-mono text-muted-foreground/70">日内走势</div>
        <div className="text-sm text-muted-foreground/78">{sparkline.statusText}</div>
        <div className="text-[11px] font-mono text-muted-foreground/55">等待盘中报价或组合序列返回</div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={sparkline.fillColor} stopOpacity="0.26" />
            <stop offset="100%" stopColor={sparkline.fillColor} stopOpacity="0.04" />
          </linearGradient>
        </defs>

        <line
          x1="0"
          y1={sparkline.baselineY}
          x2={width}
          y2={sparkline.baselineY}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="3 4"
          strokeWidth="1"
        />

        <path d={sparkline.areaPathData} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={sparkline.pathData}
          fill="none"
          stroke={sparkline.color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-mono text-muted-foreground/65">
        <span>{sparkline.startLabel || "开盘"}</span>
        <span>{sparkline.rangeLabel}</span>
        <span>{sparkline.endLabel || "现在"}</span>
      </div>

      {sparkline.statusText ? (
        <div className="absolute right-0 top-0 text-[10px] font-mono text-foreground/55">
          {sparkline.statusText}
        </div>
      ) : null}
    </div>
  );
}
