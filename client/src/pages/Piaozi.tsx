import Navigation from "@/components/Navigation";
import {
  BackToHomeLink,
  PortfolioFull,
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
        <div className="route-shell mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-[1.35rem] p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <BackToHomeLink />
                <h1 className="mt-4 text-2xl font-semibold leading-tight text-foreground md:text-[34px] md:leading-[1.08]">
                  {t.piaozi.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                  持仓、财经新闻和研究来源，放在一页看完。
                </p>
              </div>
            </div>
          </section>

          <PortfolioFull />
          <MarketHighlightsFull />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <StockYouTubersFull />
            <FanwanFull />
          </div>
        </div>
      </main>
    </div>
  );
}
