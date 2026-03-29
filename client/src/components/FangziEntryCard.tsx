import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function FangziEntryCard() {
  return (
    <Link href="/fangzi">
      <div className="entry-card group cursor-pointer">
        <div className="min-w-0">
          <div className="entry-card-label text-emerald-300/75">
            Housing signals
          </div>
          <div className="entry-card-title mt-1">去看完整房子页</div>
          <div className="entry-card-description mt-1">
            利率、住房判断、湾区线索和现在更适合租还是买的简报
          </div>
        </div>
        <div className="entry-card-orb shrink-0 border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 group-hover:translate-x-1 group-hover:border-emerald-400/45">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
