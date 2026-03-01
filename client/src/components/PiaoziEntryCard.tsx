import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function PiaoziEntryCard() {
  return (
    <Link href="/piaozi">
      <div className="group flex items-center justify-end gap-1.5 pt-1 border-t border-border/20 cursor-pointer">
        <span className="text-xs font-mono text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
          完整持仓分析 · 更多指数 · 博主列表
        </span>
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}
