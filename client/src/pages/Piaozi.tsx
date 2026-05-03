import { useEffect } from "react";
import Navigation from "@/components/Navigation";
import StockCommunityWidget from "@/components/StockCommunityWidget";
import {
  PortfolioFull,
  MarketHighlightsFull,
  StockYouTubersFull,
} from "@/components/piaozi";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDailyBriefState } from "@/hooks/useDailyBriefState";

export default function Piaozi() {
  useLanguage();
  const { markSectionVisited } = useDailyBriefState();

  useEffect(() => {
    markSectionVisited("finance");
  }, [markSectionVisited]);

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="route-shell mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-3 px-4 py-4 md:gap-4 md:px-6 md:py-6">
          <div className="min-w-0">
            <PortfolioFull />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.18fr_0.82fr] xl:items-start">
            <div className="grid gap-3">
              <div className="min-w-0">
                <MarketHighlightsFull />
              </div>
              <div className="min-w-0">
                <StockYouTubersFull />
              </div>
            </div>
            <div className="min-w-0">
              <StockCommunityWidget maxItems={6} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
