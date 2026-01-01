/**
 * Shared component: Data state badge
 * Displays ok/stale/unavailable status with consistent styling
 */

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface DataStateBadgeProps {
  status: "ok" | "stale" | "unavailable";
  className?: string;
}

export default function DataStateBadge({ status, className = "" }: DataStateBadgeProps) {
  if (status === "ok") {
    return (
      <div
        className={`flex items-center gap-1 text-xs text-green-400 ${className}`}
        title="数据正常"
      >
        <CheckCircle2 className="w-3 h-3" />
        <span className="font-mono">正常</span>
      </div>
    );
  }

  if (status === "stale") {
    return (
      <div
        className={`flex items-center gap-1 text-xs text-yellow-400 ${className}`}
        title="数据可能已过期"
      >
        <Clock className="w-3 h-3" />
        <span className="font-mono">过期</span>
      </div>
    );
  }

  // unavailable
  return (
    <div
      className={`flex items-center gap-1 text-xs text-red-400 ${className}`}
      title="数据不可用"
    >
      <AlertCircle className="w-3 h-3" />
      <span className="font-mono">不可用</span>
    </div>
  );
}
