import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function BaoguoEntryCard() {
  return (
    <Link href="/baoguo">
      <div className="entry-card group cursor-pointer">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">
            Work signals
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">去看完整包裹页</div>
          <div className="mt-1 text-xs text-muted-foreground/65">
            裁员帖、找工讨论、社区风向和最近值得点开的工作内容
          </div>
        </div>
        <div className="entry-card-orb shrink-0 border border-sky-500/25 bg-sky-500/10 text-sky-300 group-hover:translate-x-1 group-hover:border-sky-400/45">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
