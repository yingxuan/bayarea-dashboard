/**
 * ChiheEntryCard - 吃喝子页入口卡片
 *
 * Data Punk 风格的 CTA 卡片，引导用户查看更多餐饮推荐
 * - 深色背景，霓虹强调色
 * - 醒目但不打断阅读流
 * - 点击跳转到 /chihe
 */

import { Link } from "wouter";
import { ArrowRight, Utensils } from "lucide-react";

export default function ChiheEntryCard() {
  return (
    <Link href="/chihe">
      <div className="group relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-r from-card via-card to-card/80 p-4 cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-[0_0_20px_rgba(0,255,136,0.1)]">
        {/* Subtle glow effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
              <Utensils className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium font-mono text-foreground group-hover:text-primary transition-colors">
                查看更多推荐
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                奶茶 / 中餐 / 夜宵 / 新店打卡
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
            <span className="text-xs font-mono hidden sm:inline">吃喝</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}
