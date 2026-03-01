import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function ChiheEntryCard() {
  return (
    <Link href="/chihe">
      <div className="group flex items-center justify-end gap-1.5 pt-1 border-t border-amber-500/20 cursor-pointer">
        <span className="text-xs font-mono text-muted-foreground/50 group-hover:text-amber-400/80 transition-colors">
          更多推荐 · 奶茶 · 中餐 · 夜宵
        </span>
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-amber-400/80 group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}
