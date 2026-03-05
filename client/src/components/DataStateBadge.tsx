/**
 * Shared component: Data state badge
 * Displays ok/stale/unavailable status with consistent styling
 */

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

interface DataStateBadgeProps {
  status: "ok" | "stale" | "unavailable";
  className?: string;
}

export default function DataStateBadge({ status, className = "" }: DataStateBadgeProps) {
  const { lang } = useLanguage();
  const t = useT(lang);

  if (status === "ok") {
    return (
      <div
        className={`flex items-center gap-1 text-xs text-green-400 ${className}`}
        title={t.dataState.okTitle}
      >
        <CheckCircle2 className="w-3 h-3" />
        <span className="font-mono">{t.dataState.ok}</span>
      </div>
    );
  }

  if (status === "stale") {
    return (
      <div
        className={`flex items-center gap-1 text-xs text-yellow-400 ${className}`}
        title={t.dataState.staleTitle}
      >
        <Clock className="w-3 h-3" />
        <span className="font-mono">{t.dataState.stale}</span>
      </div>
    );
  }

  // unavailable
  return (
    <div
      className={`flex items-center gap-1 text-xs text-red-400 ${className}`}
      title={t.dataState.unavailableTitle}
    >
      <AlertCircle className="w-3 h-3" />
      <span className="font-mono">{t.dataState.unavailable}</span>
    </div>
  );
}
