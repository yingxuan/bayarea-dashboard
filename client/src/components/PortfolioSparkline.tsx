/**
 * Portfolio Sparkline Component
 * Google Finance-style mini sparkline for portfolio value trend
 * - SVG line chart with gradient fill
 * - No axes, ticks, or legend
 * - Green for gains, red for losses
 * - Shows source/status in corner
 */

import { useMemo } from "react";

interface ValueDataPoint {
  t: string; // ISO 8601 timestamp
  v: number; // Portfolio value
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
  width?: number; // Desktop width
  height?: number;
}

export default function PortfolioSparkline({
  data,
  currentValue,
  dailyChangePercent,
  width = 200,
  height = 40,
}: PortfolioSparklineProps) {
  const { pathData, areaPathData, color, fillColor, statusText } = useMemo(() => {
    if (!data || !data.items || data.items.length === 0) {
      // No data - return flat line
      const flatPath = `M 0 ${height * 0.5} L ${width} ${height * 0.5}`;
      const flatArea = `M 0 ${height} L 0 ${height * 0.5} L ${width} ${height * 0.5} L ${width} ${height} Z`;
      return {
        pathData: flatPath,
        areaPathData: flatArea,
        color: '#9ca3af', // gray-400
        fillColor: '#9ca3af',
        statusText: '暂无数据',
      };
    }

    const points = data.items;
    const isPositive = dailyChangePercent >= 0;
    const lineColor = isPositive ? '#4ade80' : '#f87171'; // green-400 : red-400
    const fillColorValue = isPositive ? '#4ade80' : '#f87171';

    // Calculate min/max for scaling
    const values = points.map(p => p.v);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1; // Avoid division by zero

    // Generate path data
    const pathPoints: string[] = [];
    const areaPoints: string[] = [];
    
    points.forEach((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const normalizedValue = (point.v - minValue) / valueRange;
      const y = height - (normalizedValue * height * 0.8) - (height * 0.1); // Leave 10% padding top/bottom
      
      if (index === 0) {
        pathPoints.push(`M ${x} ${y}`);
        areaPoints.push(`M ${x} ${height}`);
        areaPoints.push(`L ${x} ${y}`);
      } else {
        pathPoints.push(`L ${x} ${y}`);
        areaPoints.push(`L ${x} ${y}`);
      }
    });

    // Close area path
    const lastX = width;
    areaPoints.push(`L ${lastX} ${height} Z`);

    const pathData = pathPoints.join(' ');
    const areaPathData = areaPoints.join(' ');

    // Status text
    let statusText = '';
    if (data.source === 'seed') {
      statusText = data.note || '备用';
    } else if (data.status === 'failed') {
      statusText = '暂时无日内曲线';
    }

    return {
      pathData,
      areaPathData,
      color: lineColor,
      fillColor: fillColorValue,
      statusText,
    };
  }, [data, currentValue, dailyChangePercent, width, height]);

  // Mobile width adjustment
  const mobileWidth = Math.max(140, Math.min(180, width * 0.7));

  // Generate unique IDs for gradients to avoid conflicts (use useMemo to avoid re-renders)
  const { gradientId, gradientIdMobile } = useMemo(() => {
    const id = Math.random().toString(36).substring(7);
    return {
      gradientId: `sparkline-fill-${width}-${id}`,
      gradientIdMobile: `sparkline-fill-mobile-${mobileWidth}-${id}`,
    };
  }, [width, mobileWidth]);

  return (
    <div className="relative w-full">
      <svg
        width={width}
        height={height}
        className="hidden md:block"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <path
          d={areaPathData}
          fill={`url(#${gradientId})`}
          stroke="none"
        />
        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      {/* Mobile version */}
      <svg
        width={mobileWidth}
        height={height}
        className="md:hidden"
        viewBox={`0 0 ${mobileWidth} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientIdMobile} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <path
          d={areaPathData.replace(new RegExp(`${width}`, 'g'), mobileWidth.toString())}
          fill={`url(#${gradientIdMobile})`}
          stroke="none"
        />
        {/* Line */}
        <path
          d={pathData.replace(new RegExp(`${width}`, 'g'), mobileWidth.toString())}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Status text (corner) */}
      {statusText && (
        <div className="absolute bottom-0 right-0 text-[8px] opacity-50 font-mono text-foreground/60">
          {statusText}
        </div>
      )}
    </div>
  );
}
