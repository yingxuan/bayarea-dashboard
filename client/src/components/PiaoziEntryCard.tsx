import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function PiaoziEntryCard() {
  return (
    <Link href="/piaozi">
      <div className="entry-card group cursor-pointer">
        <div className="min-w-0">
          <div className="entry-card-label text-cyan-300/70">
            Dive deeper
          </div>
          <div className="entry-card-title mt-1">
            去看完整财务驾驶舱
          </div>
          <div className="entry-card-description mt-1">
            持仓分析、更多指数、市场情绪、频道追踪
          </div>
        </div>
        <div className="entry-card-orb shrink-0 border border-primary/25 bg-primary/10 text-primary group-hover:translate-x-1 group-hover:border-primary/50">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
