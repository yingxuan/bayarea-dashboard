/**
 * Piaozi Page - Complete Finance/Investment Details
 * 票子子页 - 财务/投资完整详情页
 *
 * Displays extended versions of all money-related modules:
 * - PortfolioFull: Complete holdings list with chart
 * - IndicesDetail: More market indices
 * - MarketHighlightsFull: More news with filtering
 * - StockYouTubersFull: All channels with video history
 * - FanwanFull: 14-day complete video list
 */

import Navigation from "@/components/Navigation";
import {
  BackToHomeLink,
  PortfolioFull,
  IndicesDetail,
  MarketHighlightsFull,
  StockYouTubersFull,
  FanwanFull,
} from "@/components/piaozi";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";

export default function Piaozi() {
  const { lang } = useLanguage();
  const t = useT(lang);

  return (
    <div className="min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-6 space-y-6">
          {/* Page Header */}
          <div className="space-y-2">
            <BackToHomeLink />
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-mono font-semibold">
                <span className="neon-text-blue">{t.piaozi.title}</span>
              </h1>
              <span className="text-sm text-muted-foreground font-mono">
                {t.piaozi.subtitle}
              </span>
            </div>
          </div>

          {/* Portfolio Section */}
          <section>
            <PortfolioFull />
          </section>

          {/* Indices Section */}
          <section>
            <IndicesDetail />
          </section>

          {/* Market Highlights Section */}
          <section>
            <MarketHighlightsFull />
          </section>

          {/* Stock YouTubers Section */}
          <section>
            <StockYouTubersFull />
          </section>

          {/* Fanwan Section */}
          <section>
            <FanwanFull />
          </section>

          {/* Bottom Navigation */}
          <div className="pt-6 border-t border-border/30">
            <BackToHomeLink />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground font-mono">
            <div>
              <span className="neon-text-blue font-bold">{t.home.footerTagline}</span>
              <span className="ml-2">| {t.piaozi.title} - {t.piaozi.subtitle}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>{t.home.footerSub}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
