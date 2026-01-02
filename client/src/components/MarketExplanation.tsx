/**
 * Market Explanation Component
 * Displays auto-generated market explanations based on portfolio daily change and top movers
 * - Always shows 2-3 bullet points
 * - Never returns empty/null
 */

import { useMemo } from "react";
import { generateMarketExplanation } from "@/lib/judgment";

interface MarketExplanationProps {
  dailyPct: number;
  topMovers: string[]; // tickers 列表
}

export default function MarketExplanation({ dailyPct, topMovers }: MarketExplanationProps) {
  const explanation = useMemo(() => {
    return generateMarketExplanation(dailyPct, topMovers);
  }, [dailyPct, topMovers]);

  // 确保永远有解释（防御性编程）
  if (!explanation || !explanation.explanations || explanation.explanations.length === 0) {
    return (
      <div className="glow-border rounded-sm p-4 bg-card">
        <h3 className="text-base font-semibold font-mono mb-3 text-foreground/90">
          市场解释
        </h3>
        <div className="text-sm text-muted-foreground font-mono">
          数据加载中...
        </div>
      </div>
    );
  }

  return (
    <div className="glow-border rounded-sm p-4 bg-card">
      <h3 className="text-base font-semibold font-mono mb-3 text-foreground/90">
        市场解释
      </h3>
      <ul className="space-y-1.5">
        {explanation.explanations.slice(0, 3).map((text, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm text-foreground/80 font-mono"
          >
            <span className="text-primary mt-0.5">•</span>
            <span className="flex-1 leading-relaxed">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
