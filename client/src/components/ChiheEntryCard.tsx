import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export default function ChiheEntryCard() {
  return (
    <Link href="/chihe">
      <div className="entry-card group cursor-pointer">
        <div className="min-w-0">
          <div className="entry-card-label text-amber-300/75">
            More places
          </div>
          <div className="entry-card-title mt-1">
            去看完整吃喝推荐页
          </div>
          <div className="entry-card-description mt-1">
            奶茶、中餐、夜宵、新店打卡一次看完
          </div>
        </div>
        <div className="entry-card-orb shrink-0 border border-amber-500/25 bg-amber-500/10 text-amber-300 group-hover:translate-x-1 group-hover:border-amber-400/45">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
