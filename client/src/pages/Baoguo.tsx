import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import TimeAgo from "@/components/TimeAgo";
import OfferCommunityWidget from "@/components/OfferCommunityWidget";
import CompactVideoFeed from "@/components/CompactVideoFeed";
import StartupNewsList from "@/components/StartupNewsList";
import JobMarketTrendChart from "@/components/JobMarketTrendChart";
import { useExternalLink } from "@/hooks/useExternalLink";
import { useDailyBriefState } from "@/hooks/useDailyBriefState";
import { config } from "@/config";
import { useLanguage } from "@/contexts/LanguageContext";

interface JobItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  category?: "layoff" | "hiring" | "discussion";
}

interface JobsResponse {
  items: JobItem[];
}

export default function Baoguo() {
  const { lang } = useLanguage();
  const { handleExternalLinkClick } = useExternalLink();
  const { markSectionVisited } = useDailyBriefState();

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    markSectionVisited("work");
  }, [markSectionVisited]);

  useEffect(() => {
    async function loadJobs() {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/community/jobs`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const data: JobsResponse = await response.json();
          setJobs(data.items || []);
        }
      } catch (error) {
        console.error("[Baoguo] Failed to fetch work data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadJobs();
    const interval = setInterval(loadJobs, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const layoffItems = useMemo(
    () => jobs.filter((item) => item.category === "layoff").slice(0, 8),
    [jobs],
  );

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="route-shell mx-auto w-full max-w-6xl px-4 py-4 md:px-6 md:py-6">
          <div className="min-w-0">
            <JobMarketTrendChart />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                {lang === "en" ? "Layoff News" : "裁员新闻"}
              </h2>
              {loading ? (
                <div className="grid gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-sm bg-muted/40" />
                  ))}
                </div>
              ) : layoffItems.length === 0 ? (
                <div className="rounded-sm border border-border/25 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  {lang === "en" ? "No clear layoff updates right now." : "暂时没有抓到明确裁员动态。"}
                </div>
              ) : (
                <div className="space-y-3">
                  {layoffItems.map((item, idx) => (
                    <a
                      key={`${item.url}-${idx}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleExternalLinkClick}
                      className="group flex min-w-0 flex-col gap-2 rounded-sm border border-border/30 bg-card/45 p-3 transition-all hover:border-primary/35 hover:bg-card/65 sm:flex-row sm:items-start sm:gap-3 sm:p-4"
                    >
                      <span className="shrink-0 self-start rounded-sm bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-rose-300">
                        {item.source}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 break-words text-sm leading-6 text-foreground/90 transition-colors group-hover:text-primary">
                          {item.title}
                        </div>
                        {item.publishedAt ? (
                          <div className="mt-2 text-[11px] font-mono text-muted-foreground/65">
                            <TimeAgo isoString={item.publishedAt} />
                          </div>
                        ) : null}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                {lang === "en" ? "Offers / Interview Notes" : "Offer / 面经"}
              </h2>
              <OfferCommunityWidget maxItems={6} />
            </section>
          </div>

          <StartupNewsList
            maxItems={8}
            title={lang === "en" ? "Bay Area Startup News" : "湾区 Startup 新闻"}
          />

          <section className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              {lang === "en" ? "Career Videos" : "找工视频"}
            </h2>
            <CompactVideoFeed
              kind="career"
              maxItems={8}
              layout="carousel"
              hideHeader
              carouselItemClassName="min-w-0 shrink-0 basis-[84%] pl-3 sm:basis-[62%] md:basis-1/2 xl:basis-1/3 2xl:basis-1/4"
            />
          </section>
        </div>
      </main>
    </div>
  );
}
