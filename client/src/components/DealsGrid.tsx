/**
 * Data Punk Design: Deals grid with scoring system
 * - Display deal score prominently
 * - Show discount information clearly
 * - Neon accents for high-value deals
 */

import { ExternalLink, TrendingUp, Clock, Flame } from "lucide-react";
import TimeAgo from "@/components/TimeAgo";
import SourceLink from "@/components/SourceLink";

interface Deal {
  id: string;
  title: string;
  description: string;
  category: string;
  discountInfo: {
    type: string;
    value: number;
    unit?: string;
  };
  score: number;
  practicalityScore: number;
  discountScore: number;
  timelinessScore: number;
  popularityScore: number;
  source: string;
  sourceImage: string;
  url: string;
  expiresAt: string;
  publishedAt: string;
}

interface DealsGridProps {
  deals: Deal[];
  maxItems?: number;
}

export default function DealsGrid({ deals, maxItems = 12 }: DealsGridProps) {
  const displayDeals = deals.slice(0, maxItems);

  const formatDiscount = (discountInfo: Deal["discountInfo"]) => {
    switch (discountInfo.type) {
      case "percentage":
        return `${discountInfo.value}% OFF`;
      case "price_off":
        return `$${discountInfo.value} OFF${
          discountInfo.unit ? ` ${discountInfo.unit}` : ""
        }`;
      case "bogo":
        return "BOGO";
      case "free_shipping":
        return "免配送费";
      case "special_price":
        return `$${discountInfo.value}`;
      case "bundle":
        return "套餐优惠";
      default:
        return "优惠";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-primary";
    if (score >= 80) return "text-green-400";
    if (score >= 70) return "text-yellow-400";
    return "text-muted-foreground";
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 24) return `${diffHours}小时后过期`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天后过期`;
    return `${Math.floor(diffDays / 7)}周后过期`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayDeals.map((deal) => (
        <a
          key={deal.id}
          href={deal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm p-4 bg-card border border-border/40 shadow-md hover:bg-card/80 transition-all group"
        >
          {/* Header with score and source */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <img
                src={deal.sourceImage}
                alt={deal.source}
                className="w-4 h-4 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="text-xs opacity-60 text-muted-foreground font-mono font-normal">
                {deal.source}
              </span>
            </div>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-semibold tabular-nums ${
                deal.score >= 90
                  ? "bg-primary/20 text-primary"
                  : deal.score >= 80
                  ? "bg-green-500/20 text-green-500/70"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>{deal.score}</span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[14px] font-medium mb-2 line-clamp-2 group-hover:text-primary transition-colors" style={{ lineHeight: '1.4' }}>
            {deal.title}
          </h3>

          {/* Description */}
          <p className="text-xs font-normal text-foreground/70 mb-3 line-clamp-2" style={{ lineHeight: '1.4' }}>
            {deal.description}
          </p>

          {/* Discount Badge */}
          <div className="mb-3">
            <span className="inline-block px-3 py-1 bg-primary/20 text-primary text-[14px] font-semibold font-mono rounded tabular-nums">
              {formatDiscount(deal.discountInfo)}
            </span>
          </div>

          {/* Score Breakdown */}
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs opacity-60">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground font-normal">实用:</span>
              <span className={`font-medium tabular-nums ${getScoreColor(deal.practicalityScore)}`}>
                {deal.practicalityScore}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground font-normal">折扣:</span>
              <span className={`font-medium tabular-nums ${getScoreColor(deal.discountScore)}`}>
                {deal.discountScore}
              </span>
            </div>
          </div>

          {/* Expiry and Source */}
          <div className="flex items-center justify-between gap-1 text-xs opacity-60 text-muted-foreground font-normal">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatTimeRemaining(deal.expiresAt)}</span>
            </div>
            <SourceLink
              name=""
              url={deal.url}
              position="title-row"
            />
          </div>
        </a>
      ))}
    </div>
  );
}
