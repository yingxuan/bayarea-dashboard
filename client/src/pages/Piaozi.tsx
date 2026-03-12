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
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-sm p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <BackToHomeLink />
              <div className="grid gap-4 md:grid-cols-[1.25fr_0.8fr] md:items-end">
                <div className="min-w-0">
                  <div className="eyebrow mb-3">Money Cockpit</div>
                  <h1 className="text-2xl font-semibold leading-tight text-foreground md:text-[34px] md:leading-[1.08]">
                    {t.piaozi.title}
                  </h1>
                  <div className="mt-2 text-sm font-medium text-primary/90 md:text-base">
                    {t.piaozi.subtitle}
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    从持仓、指数、市场线索到频道内容，把今天跟钱有关的判断集中在一页看完。
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/75">
                      Portfolio
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      先看你的仓位和日内变化，再决定是否需要操作。
                    </div>
                  </div>
                  <div className="hero-pulse-card rounded-sm p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">
                      Market
                    </div>
                    <div className="mt-2 text-sm leading-6 text-foreground/88">
                      用指数和重点新闻做背景判断，不把短期波动误读成趋势。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <PortfolioFull />
          <IndicesDetail />
          <MarketHighlightsFull />
          <StockYouTubersFull />
          <FanwanFull />

          <div className="border-t border-border/30 pt-6">
            <BackToHomeLink />
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-border py-6">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-xs font-mono text-muted-foreground/55 md:flex-row md:text-left">
            <div>
              <span className="text-sm font-semibold text-cyan-300/85">{t.home.footerTagline}</span>
              <span className="ml-2">| {t.piaozi.title} - {t.piaozi.subtitle}</span>
            </div>
            <span>{t.home.footerSub}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
