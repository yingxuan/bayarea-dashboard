import { useEffect, useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/lib/translations";
import { useExternalLink } from "@/hooks/useExternalLink";
import { useDailyBriefState } from "@/hooks/useDailyBriefState";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { config } from "@/config";

type ZipMarket = {
  zip: string;
  region: string;
  medianSalePrice: string;
  yoy: string;
  daysOnMarket: string;
  offersAvg: string;
  saleToList: string;
  heat: string;
  summary: string;
  marketUrl: string;
  openHouseUrl: string;
  openHouses: Array<{
    address: string;
    streetAddress: string;
    price: string;
    beds: string;
    baths: string;
    size: string;
    middleSchool: string;
    highSchool: string;
    schedule: string;
    image: string;
    url: string;
  }>;
};

type HousingVideo = {
  videoId?: string;
  title: string;
  subtitle: string;
  url: string;
  image: string;
};

type HousingProviderLink = {
  label: string;
  url: string;
};

const FALLBACK_HOUSING_VIDEOS: HousingVideo[] = [
  {
    videoId: "fallback-housing-1",
  title: "æœ¬å‘¨æ¹¾åŒºåŽäººæˆ¿å¸‚è§†é¢‘",
  subtitle: "ç›´æŽ¥çœ‹ä¸­æ–‡æˆ¿äº§é¢‘é“åœ¨èŠä»€ä¹ˆ",
  url: "https://www.youtube.com/@cindywangrealtor/videos",
  image:
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&h=900&fit=crop",
  },
];

const ZIP_MARKETS: ZipMarket[] = [
  {
    zip: "95014",
    region: "Cupertino",
    medianSalePrice: "$3.23M",
    yoy: "+28.1%",
    daysOnMarket: "18 days",
    offersAvg: "4 offers",
    saleToList: "104.2%",
    heat: "é«˜æ€»ä»·ç›˜éŸ§æ€§æœ€å¼º",
    summary: "95014 çš„ä¾›ç»™ä»å°‘ï¼Œå­¦åŒºå’Œåœ°æ®µè®©é«˜æ€»ä»·æˆ¿æºä¿æŒç«žäº‰åŠ›ã€‚",
    marketUrl: "https://www.redfin.com/zipcode/95014/housing-market",
    openHouseUrl: "https://www.redfin.com/zipcode/95014/open-houses",
    openHouses: [
      {
        address: "19990 Pear Tree Ln, Cupertino, CA 95014",
        streetAddress: "19990 Pear Tree Ln",
        price: "$3.15M",
        beds: "4 bd",
        baths: "3 ba",
        size: "2,410 sq ft",
        middleSchool: "Cupertino Middle School",
        highSchool: "Homestead High School",
        schedule: "Fri 1PM-4PM",
        image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Cupertino/19990-Pear-Tree-Ln-95014/home/567907",
      },
      {
        address: "7451 Prospect Rd, Cupertino, CA 95014",
        streetAddress: "7451 Prospect Rd",
        price: "$4.50M",
        beds: "5 bd",
        baths: "4 ba",
        size: "3,560 sq ft",
        middleSchool: "Lawson Middle School",
        highSchool: "Monta Vista High School",
        schedule: "Sat 1PM-4PM",
        image: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Cupertino/7451-Prospect-Rd-95014/home/692694",
      },
    ],
  },
  {
    zip: "94043",
    region: "Palo Alto / 94043",
    medianSalePrice: "$2.48M",
    yoy: "+4.9%",
    daysOnMarket: "16 days",
    offersAvg: "5 offers",
    saleToList: "102.1%",
    heat: "åŠå²›æ ¸å¿ƒåŒºè¿˜æ˜¯ç¨³",
    summary: "94043 è¿™ç±»åŠå²›æ ¸å¿ƒå¸¦ä»ç„¶ç¨³å®šï¼Œåº“å­˜æœ‰é™ï¼Œä¹°å®¶ä¸ä¼šè½»æ˜“ç­‰å¤ªä¹…ã€‚",
    marketUrl: "https://www.redfin.com/zipcode/94043/housing-market",
    openHouseUrl: "https://www.redfin.com/zipcode/94043/open-houses",
    openHouses: [
      {
        address: "346 Circuit Way, Mountain View, CA 94043",
        streetAddress: "346 Circuit Way",
        price: "$2.35M",
        beds: "4 bd",
        baths: "3.5 ba",
        size: "2,012 sq ft",
        middleSchool: "Crittenden Middle School",
        highSchool: "Mountain View High School",
        schedule: "Sat 1PM-4PM",
        image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Mountain-View/346-Circuit-Way-94043/home/167201167",
      },
      {
        address: "2039 Colony St, Mountain View, CA 94043",
        streetAddress: "2039 Colony St",
        price: "$2.68M",
        beds: "4 bd",
        baths: "3 ba",
        size: "2,188 sq ft",
        middleSchool: "Graham Middle School",
        highSchool: "Mountain View High School",
        schedule: "Sun 1PM-4PM",
        image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Mountain-View/2039-Colony-St-94043/home/143042792",
      },
    ],
  },
  {
    zip: "94087",
    region: "Sunnyvale",
    medianSalePrice: "$2.71M",
    yoy: "+3.9%",
    daysOnMarket: "11 days",
    offersAvg: "7 offers",
    saleToList: "103.4%",
    heat: "å­¦æ ¡ç›˜ä»ç„¶åçƒ­",
    summary: "94087 è¿˜æ˜¯å…¸åž‹çš„å­¦åŒºåˆšéœ€ç›˜ï¼Œæˆäº¤èŠ‚å¥å¿«ï¼Œè®®ä»·ç©ºé—´ä¸å¤§ã€‚",
    marketUrl: "https://www.redfin.com/zipcode/94087/housing-market",
    openHouseUrl: "https://www.redfin.com/zipcode/94087/open-houses",
    openHouses: [
      {
        address: "827 Cumberland Dr, Sunnyvale, CA 94087",
        streetAddress: "827 Cumberland Dr",
        price: "$2.85M",
        beds: "4 bd",
        baths: "2 ba",
        size: "1,892 sq ft",
        middleSchool: "Sunnyvale Middle School",
        highSchool: "Homestead High School",
        schedule: "Sat 1PM-4PM",
        image: "https://images.unsplash.com/photo-1448630360428-65456885c650?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Sunnyvale/827-Cumberland-Dr-94087/home/1310065",
      },
      {
        address: "627 E El Camino Real #106, Sunnyvale, CA 94087",
        streetAddress: "627 E El Camino Real #106",
        price: "$3.38M",
        beds: "4 bd",
        baths: "3.5 ba",
        size: "2,420 sq ft",
        middleSchool: "Sunnyvale Middle School",
        highSchool: "Fremont High School",
        schedule: "Sun 1PM-4PM",
        image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Sunnyvale/627-E-El-Camino-Real-94087/unit-106/home/12181288",
      },
    ],
  },
  {
    zip: "95129",
    region: "West San Jose",
    medianSalePrice: "$2.42M",
    yoy: "+6.3%",
    daysOnMarket: "15 days",
    offersAvg: "6 offers",
    saleToList: "103.0%",
    heat: "å­¦åŒº+é€šå‹¤å…¼é¡¾",
    summary: "95129 é€šå¸¸æ˜¯æ€§ä»·æ¯”å’Œå­¦åŒºçš„å¹³è¡¡ç‚¹ï¼Œå‡ºå¥½æˆ¿æ—¶æŠ¢çš„äººä¸ä¼šå°‘ã€‚",
    marketUrl: "https://www.redfin.com/zipcode/95129/housing-market",
    openHouseUrl: "https://www.redfin.com/zipcode/95129/open-houses",
    openHouses: [
      {
        address: "6112 Brigantine Dr, San Jose, CA 95129",
        streetAddress: "6112 Brigantine Dr",
        price: "$2.28M",
        beds: "4 bd",
        baths: "2 ba",
        size: "1,740 sq ft",
        middleSchool: "Miller Middle School",
        highSchool: "Lynbrook High School",
        schedule: "Sat 1PM-4PM",
        image: "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/San-Jose/6112-Brigantine-Dr-95129/home/1740350",
      },
      {
        address: "4802 Rio Vista Ave, San Jose, CA 95129",
        streetAddress: "4802 Rio Vista Ave",
        price: "$2.62M",
        beds: "4 bd",
        baths: "2.5 ba",
        size: "2,124 sq ft",
        middleSchool: "Miller Middle School",
        highSchool: "Lynbrook High School",
        schedule: "Sun 1PM-4PM",
        image: "https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/San-Jose/4802-Rio-Vista-Ave-95129/home/754689",
      },
    ],
  },
  {
    zip: "94539",
    region: "Fremont Mission",
    medianSalePrice: "$1.85M",
    yoy: "-8.6%",
    daysOnMarket: "22 days",
    offersAvg: "8 offers",
    saleToList: "101.4%",
    heat: "ä»·æ ¼å›žè°ƒï¼Œä½†æŠ¢æˆ¿è¿˜åœ¨",
    summary: "94539 çš„ä»·æ ¼å›žæ’¤æ¯”åŠå²›æ˜Žæ˜¾ï¼Œä½†å¥½å­¦åŒºç›˜ä¸€å‡ºæ¥è¿˜æ˜¯ä¼šæœ‰å¤šäººå‡ºä»·ã€‚",
    marketUrl: "https://www.redfin.com/zipcode/94539/housing-market",
    openHouseUrl: "https://www.redfin.com/zipcode/94539/open-houses",
    openHouses: [
      {
        address: "42077 Miranda St, Fremont, CA 94539",
        streetAddress: "42077 Miranda St",
        price: "$2.10M",
        beds: "4 bd",
        baths: "3 ba",
        size: "2,230 sq ft",
        middleSchool: "William Hopkins Middle School",
        highSchool: "Mission San Jose High School",
        schedule: "Sat 1PM-4PM",
        image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Fremont/42077-Miranda-St-94539/home/883529",
      },
      {
        address: "44388 Parkmeadow Dr, Fremont, CA 94539",
        streetAddress: "44388 Parkmeadow Dr",
        price: "$2.55M",
        beds: "5 bd",
        baths: "3 ba",
        size: "2,610 sq ft",
        middleSchool: "William Hopkins Middle School",
        highSchool: "Mission San Jose High School",
        schedule: "Sun 1PM-4PM",
        image: "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=1200&h=900&fit=crop",
        url: "https://www.redfin.com/CA/Fremont/44388-Parkmeadow-Dr-94539/home/534019",
      },
    ],
  },
];

const DEFAULT_RATE_BY_TYPE_AND_TERM: Record<"fixed" | "arm", Record<number, number>> = {
  fixed: {
    15: 5.62,
    20: 5.88,
    30: 6.11,
  },
  arm: {
    5: 5.34,
    7: 5.49,
    10: 5.71,
  },
};

function getProviderLinks(market: ZipMarket): HousingProviderLink[] {
  const coldwellByZip: Record<string, string> = {
    "95014": "https://www.coldwellbankerhomes.com/ca/cupertino/95014/open-houses/",
    "94043": "https://www.coldwellbankerhomes.com/ca/mountain-view/94043/open-houses/",
    "94087": "https://www.coldwellbankerhomes.com/ca/sunnyvale/94087/open-houses/",
    "95129": "https://www.coldwellbankerhomes.com/ca/san-jose/95129/open-houses/",
    "94539": "https://www.coldwellbankerhomes.com/ca/fremont/94539/open-houses/",
  };

  return [
    { label: "Redfin", url: market.openHouseUrl },
    { label: "Realtor", url: `https://www.realtor.com/realestateandhomes-search/${market.zip}/open-house` },
    { label: "Homes.com", url: `https://www.homes.com/for-sale/${market.zip}/open-house/` },
    ...(coldwellByZip[market.zip]
      ? [{ label: "Coldwell Banker", url: coldwellByZip[market.zip] }]
      : []),
    { label: "MLS Listings", url: `https://www.mlslistings.com/Search/ByZipCode/${market.zip}` },
  ];
}

function getWeeklyDigestCopy(market: ZipMarket) {
  return `${market.medianSalePrice} · ${market.yoy} YoY · ${market.daysOnMarket} on market · ${market.offersAvg}`;
}

function getWeeklyDigestLead(market: ZipMarket) {
  return `${market.region} 这周还是 ${market.heat}。${market.summary}`;
}

function MortgageCalculator() {
  const [homePrice, setHomePrice] = useState(2_500_000);
  const [downPayment, setDownPayment] = useState(750_000);
  const [loanType, setLoanType] = useState<"fixed" | "arm">("fixed");
  const [rate, setRate] = useState(DEFAULT_RATE_BY_TYPE_AND_TERM.fixed[30]);
  const [years, setYears] = useState<5 | 7 | 10 | 15 | 20 | 30>(30);
  const [result, setResult] = useState<{
    principal: number;
    monthlyPrincipalInterest: number;
    propertyTax: number;
    insurance: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    setDownPayment(Math.round(homePrice * 0.3));
  }, [homePrice]);

  useEffect(() => {
    setYears(loanType === "fixed" ? 30 : 7);
  }, [loanType]);

  useEffect(() => {
    const defaultRate = DEFAULT_RATE_BY_TYPE_AND_TERM[loanType][years];
    if (defaultRate) {
      setRate(defaultRate);
    }
  }, [loanType, years]);

  const calculate = () => {
    const principal = Math.max(homePrice - downPayment, 0);
    const monthlyRate = rate / 100 / 12;
    const payments = years * 12;
    const monthlyPrincipalInterest =
      monthlyRate === 0
        ? principal / payments
        : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -payments));
    const propertyTax = homePrice * 0.012 / 12;
    const insurance = homePrice * 0.0025 / 12;
    const total = monthlyPrincipalInterest + propertyTax + insurance;

    setResult({
      principal,
      monthlyPrincipalInterest,
      propertyTax,
      insurance,
      total,
    });
  };

  return (
    <section className="section-shell rounded-sm p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-foreground">æˆ¿è´·è®¡ç®—å™¨</h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-3">
          <label className="grid gap-2 text-sm text-foreground/84">
            æˆ¿ä»·
            <input
              type="number"
              value={homePrice}
              onChange={(e) => setHomePrice(Number(e.target.value || 0))}
              className="rounded-sm border border-border/35 bg-background/35 px-3 py-2 text-foreground"
            />
          </label>
          <label className="grid gap-2 text-sm text-foreground/84">
            é¦–ä»˜
            <input
              type="number"
              value={downPayment}
              onChange={(e) => setDownPayment(Number(e.target.value || 0))}
              className="rounded-sm border border-border/35 bg-background/35 px-3 py-2 text-foreground"
            />
          </label>
          <label className="grid gap-2 text-sm text-foreground/84">
            è´·æ¬¾ç±»åž‹
            <select
              value={loanType}
              onChange={(e) => setLoanType(e.target.value as "fixed" | "arm")}
              className="rounded-sm border border-border/35 bg-background/35 px-3 py-2 text-foreground"
            >
              <option value="fixed">Fixed</option>
              <option value="arm">ARM</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-foreground/84">
            å¹´é™
            <select
              value={years}
              onChange={(e) => setYears(Number(e.target.value) as 5 | 7 | 10 | 15 | 20 | 30)}
              className="rounded-sm border border-border/35 bg-background/35 px-3 py-2 text-foreground"
            >
              {loanType === "fixed" ? (
                <>
                  <option value={15}>15 å¹´</option>
                  <option value={20}>20 å¹´</option>
                  <option value={30}>30 å¹´</option>
                </>
              ) : (
                <>
                  <option value={5}>5/1 ARM</option>
                  <option value={7}>7/1 ARM</option>
                  <option value={10}>10/1 ARM</option>
                </>
              )}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-foreground/84">
            åˆ©çŽ‡ %
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value || 0))}
              className="rounded-sm border border-border/35 bg-background/35 px-3 py-2 text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={calculate}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white/6 px-4 text-sm font-medium text-foreground/85 transition-colors hover:border-white/24 hover:text-foreground"
          >
            è®¡ç®—
          </button>
        </div>

        <div className="rounded-sm border border-border/25 bg-background/35 p-4">
          {result ? (
            <>
              <div className="text-sm text-muted-foreground">è´·æ¬¾é¢</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                ${result.principal.toLocaleString()}
              </div>

              <div className="mt-5 grid gap-3 text-sm text-foreground/88">
                <div className="flex items-center justify-between gap-3">
                  <span>æœˆä¾›æœ¬é‡‘+åˆ©æ¯</span>
                  <span>${Math.round(result.monthlyPrincipalInterest).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>æˆ¿äº§ç¨Žé¢„ä¼°</span>
                  <span>${Math.round(result.propertyTax).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>ä¿é™©é¢„ä¼°</span>
                  <span>${Math.round(result.insurance).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border/25 pt-3 text-base font-semibold text-foreground">
                  <span>åˆè®¡æœˆæ”¯å‡º</span>
                  <span>${Math.round(result.total).toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
              è¾“å…¥å‚æ•°åŽç‚¹å‡»â€œè®¡ç®—â€
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Fangzi() {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { handleExternalLinkClick } = useExternalLink();
  const { markSectionVisited } = useDailyBriefState();
  const [housingVideos, setHousingVideos] = useState<HousingVideo[]>(FALLBACK_HOUSING_VIDEOS);

  useEffect(() => {
    markSectionVisited("housing");
  }, [markSectionVisited]);

  useEffect(() => {
    let cancelled = false;

    const loadHousingVideo = async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/youtube/fanwan?feed=housing`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return;

        const result = await response.json();
        const items = Array.isArray(result?.videos) ? result.videos.slice(0, 6) : [];
        if (items.length === 0 || cancelled) return;

        setHousingVideos(
          items.map((item: any, index: number) => ({
            videoId: item.videoId || `housing-video-${index}`,
            title: item.title || FALLBACK_HOUSING_VIDEOS[0].title,
            subtitle: item.channelTitle
              ? `${item.channelTitle} Â· ${new Date(item.publishedAt).toLocaleDateString("en-US")}`
              : FALLBACK_HOUSING_VIDEOS[0].subtitle,
            url: item.url || FALLBACK_HOUSING_VIDEOS[0].url,
            image: item.thumbnail || FALLBACK_HOUSING_VIDEOS[0].image,
          })),
        );
      } catch {
        // keep fallback card
      }
    };

    loadHousingVideo();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-shell min-h-screen bg-background grid-bg">
      <Navigation />

      <main className="w-full min-w-0">
        <div className="route-shell mx-auto w-full max-w-6xl px-4 py-4 md:px-6 md:py-6">
          <section className="hero-panel rounded-[1.4rem] p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="hero-pulse-card rounded-sm px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/75">ZIP</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{ZIP_MARKETS.length}</div>
                  </div>
                  <div className="hero-pulse-card rounded-sm px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-sky-300/75">åˆ©çŽ‡</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">6.11%</div>
                  </div>
                  <div className="hero-pulse-card rounded-sm px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/75">æœ€çƒ­</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">95014</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="min-w-0 rounded-sm border border-border/25 bg-background/35 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Weekly digest
                    </div>
                    <div className="mt-1 text-lg font-semibold text-foreground">本周湾区房市滚动摘要</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs text-foreground/84">
                    Scroll the week
                  </div>
                </div>

                <Carousel opts={{ align: "start", loop: false, dragFree: true }} className="w-full">
                  <CarouselContent className="-ml-3">
                    {ZIP_MARKETS.map((market) => (
                      <CarouselItem
                        key={market.zip}
                        className="min-w-0 shrink-0 basis-[84%] pl-3 sm:basis-[62%] md:basis-1/2"
                      >
                        <div className="group flex h-full flex-col overflow-hidden rounded-sm border border-border/25 bg-card/45 transition-all hover:border-primary/35 hover:bg-card/65">
                          <div className="border-b border-border/20 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                  ZIP {market.zip}
                                </div>
                                <div className="mt-1 text-lg font-semibold text-foreground">{market.region}</div>
                              </div>
                              <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-amber-200">
                                {market.heat}
                              </div>
                            </div>
                          </div>
                          <div className="flex min-h-0 flex-1 flex-col p-4">
                            <div className="text-3xl font-semibold text-foreground">{market.medianSalePrice}</div>
                            <div className="mt-2 text-sm text-foreground/82">{getWeeklyDigestCopy(market)}</div>
                            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                              {getWeeklyDigestLead(market)}
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-foreground/86">
                              <div className="rounded-sm border border-white/8 bg-white/4 px-3 py-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">YoY</div>
                                <div className="mt-1 font-medium text-foreground">{market.yoy}</div>
                              </div>
                              <div className="rounded-sm border border-white/8 bg-white/4 px-3 py-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">DOM</div>
                                <div className="mt-1 font-medium text-foreground">{market.daysOnMarket}</div>
                              </div>
                              <div className="rounded-sm border border-white/8 bg-white/4 px-3 py-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Offers</div>
                                <div className="mt-1 font-medium text-foreground">{market.offersAvg}</div>
                              </div>
                              <div className="rounded-sm border border-white/8 bg-white/4 px-3 py-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Sale/List</div>
                                <div className="mt-1 font-medium text-foreground">{market.saleToList}</div>
                              </div>
                            </div>
                            <a
                              href={market.marketUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={handleExternalLinkClick}
                              className="mt-4 inline-flex items-center justify-between rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:bg-white/10"
                            >
                              <span>Open market</span>
                              <ExternalLink className="h-4 w-4 text-primary" />
                            </a>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>
              </div>
            </div>
          </section>

          <section className="grid gap-4">
            {ZIP_MARKETS.map((market) => (
              <div key={market.zip} className="section-shell min-w-0 rounded-sm p-4 sm:p-5">
                <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                  <div className="min-w-0 rounded-sm border border-border/25 bg-background/35 p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          ZIP {market.zip}
                        </div>
                        <div className="mt-1 text-xl font-semibold text-foreground">{market.region}</div>
                      </div>
                      <a
                        href={market.marketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleExternalLinkClick}
                        className="text-muted-foreground transition-colors hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>

                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Median sale price
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-foreground">{market.medianSalePrice}</div>
                    <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-amber-200">
                      {market.heat}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-foreground/84">{market.summary}</p>

                    <div className="mt-5 grid gap-2 text-sm text-foreground/88">
                      <div className="flex items-center justify-between gap-3">
                        <span>YoY</span>
                        <span>{market.yoy}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Days on market</span>
                        <span>{market.daysOnMarket}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Avg offers</span>
                        <span>{market.offersAvg}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Sale-to-list</span>
                        <span>{market.saleToList}</span>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-sm border border-border/25 bg-background/35 p-4">
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-foreground">
                        {lang === "en" ? "Live Open House Search" : "Live Open House Search"}
                      </h2>
                    </div>

                    <div className="rounded-sm border border-dashed border-border/25 bg-background/20 p-4">
                      <p className="text-sm leading-6 text-muted-foreground">
                        {lang === "en"
                          ? "Current open-house inventory opens on external sites. In-app listing cards were removed because the source was not reliable enough."
                          : "\u5f53\u524d open house \u9700\u8981\u6253\u5f00\u5916\u90e8\u7ad9\u70b9\u67e5\u770b\u6700\u65b0\u5217\u8868\u3002\u7ad9\u5185 listing cards \u5df2\u79fb\u9664\uff0c\u56e0\u4e3a\u4e0a\u6e38\u6e90\u7684\u53ef\u9760\u6027\u4e0d\u591f\u3002"}
                      </p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {getProviderLinks(market).map((provider) => (
                          <a
                            key={`${market.zip}-${provider.label}`}
                            href={provider.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleExternalLinkClick}
                            className="flex items-center justify-between rounded-sm border border-white/10 bg-white/5 px-3 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:bg-white/8"
                          >
                            <span>{provider.label}</span>
                            <ExternalLink className="h-4 w-4 text-primary" />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <MortgageCalculator />
        </div>
      </main>
    </div>
  );
}
