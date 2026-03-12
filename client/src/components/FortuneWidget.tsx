import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import FortuneConfigModal from "@/components/FortuneConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";

const STORAGE_KEY = "uf_fortune_birthdate";
const DEFAULT_DISCLAIMER = "本功能仅供娱乐参考，不构成医疗或投资建议。";

const DAILY_QUOTES = [
  "复利是第八大奇迹，不懂它的人为它付钱，懂它的人靠它赚钱。",
  "市场短期是投票机，长期是称重机。 — 格雷厄姆",
  "风险来自于你不知道自己在做什么。 — 巴菲特",
  "最好的投资是投资自己。知识不会随市场波动。",
  "你无法预测，但你可以准备。 — Howard Marks",
  "别在牛市里把自己的才华误认为是市场的馈赠。",
  "分散投资是承认无知的唯一免费午餐。",
  "每次市场崩溃都是从恐惧开始，从后悔结束。",
  "时间是优质资产的朋友，劣质资产的敌人。",
  "最危险的四个字：这次不同。",
  "代码和股票一样：不理解就不要持有。",
  "湾区码农最大的资产：高储蓄率 + 长时间窗口。",
  "今天种下的树，十年后你会感谢自己。",
  "不要用明天的钱解决今天的问题。",
  "在别人贪婪时恐惧，在别人恐惧时贪婪。",
];

function getDailyQuote(): string {
  const day = new Date().getDate() + new Date().getMonth() * 31;
  return DAILY_QUOTES[day % DAILY_QUOTES.length];
}

interface BehaviorRadarEntry {
  status: "none" | "actionable" | "risk" | "safe" | "caution";
  summary: string;
}

interface BehaviorRadar {
  investment: BehaviorRadarEntry;
  travel: BehaviorRadarEntry;
  publicRole: BehaviorRadarEntry;
}

interface FortuneData {
  birthdate: string;
  today: string;
  generated_at: string;
  headline: string;
  verdict: string;
  do: string;
  dont: string;
  timeHint: string;
  importance: "high" | "medium" | "low";
  disclaimer: string;
  behaviorRadar: BehaviorRadar;
}

const statusLabelMap: Record<BehaviorRadarEntry["status"], string> = {
  none: "暂无",
  actionable: "可行动",
  risk: "风险",
  safe: "安全",
  caution: "需谨慎",
};

export default function FortuneWidget() {
  const [birthdate, setBirthdate] = useState<string | null>(null);
  const [data, setData] = useState<FortuneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const disclaimerText = data?.disclaimer || DEFAULT_DISCLAIMER;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setBirthdate(stored);
  }, []);

  useEffect(() => {
    if (!birthdate) {
      setData(null);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setError(null);

    const url = new URL(`${config.apiBaseUrl}/api/fortune`, window.location.origin);
    url.searchParams.set("birthdate", birthdate);

    fetch(url.toString(), {
      signal: abortController.signal,
      cache: "default",
    })
      .then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!contentType.includes("application/json")) {
          throw new Error("服务器未返回 JSON，请稍后再试");
        }
        return response.json();
      })
      .then((result: FortuneData) => {
        setData(result);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || "加载失败，请重试");
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => abortController.abort();
  }, [birthdate, retryKey]);

  const handleSave = (value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
    setBirthdate(value);
    setRetryKey((prev) => prev + 1);
  };

  const showSummary = useMemo(() => !!data && !loading && !error, [data, loading, error]);
  const fortuneValid =
    showSummary &&
    !!data?.headline &&
    !!data?.verdict &&
    !!data?.do &&
    !!data?.dont &&
    !!data?.timeHint &&
    !!data?.importance &&
    !!data?.behaviorRadar;

  const statusMessage = error
    ? "读取今日运势失败"
    : !birthdate
      ? "请先设置生日"
      : loading
        ? "生成中..."
        : fortuneValid
          ? "今日已生成"
          : "数据异常，请稍后重试";

  const isLowImportance = data?.importance === "low";
  const importanceTone =
    data?.importance === "high"
      ? "text-amber-300"
      : data?.importance === "medium"
        ? "text-cyan-300"
        : "text-muted-foreground";

  const headlineContent = loading ? (
    <Skeleton className="h-4 w-60" />
  ) : fortuneValid && data ? (
    data.headline
  ) : !birthdate ? (
    getDailyQuote()
  ) : (
    "数据异常"
  );

  return (
    <>
      <div className="hero-panel rounded-sm p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <div className="pt-0.5">
              <div className="eyebrow mb-2">Fortune</div>
              <div className="text-[15px] font-semibold text-foreground">今日运势</div>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div
                className={`truncate text-sm font-medium leading-snug ${
                  isLowImportance ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {headlineContent}
              </div>
              <div className={`mt-1 text-[11px] uppercase tracking-[0.16em] ${importanceTone}`}>
                {statusMessage}
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border/60 bg-card/50 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-border/50 pt-4">
                <div className="mb-3 text-xs text-muted-foreground/72">
                  今日吉凶提示（基于生辰八字） · {statusMessage}
                </div>

                {fortuneValid ? (
                  <div className="space-y-4 text-sm text-foreground">
                    <div className="rounded-sm border border-border/50 bg-card/45 p-3 text-[15px] leading-7">
                      {data!.verdict}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/8 p-3">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                          宜做
                        </div>
                        <div className="leading-6 text-foreground/92">{data!.do}</div>
                      </div>
                      <div className="rounded-sm border border-rose-500/20 bg-rose-500/8 p-3">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-rose-300/80">
                          慎做
                        </div>
                        <div className="leading-6 text-foreground/92">{data!.dont}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="signal-chip">
                        <span className="signal-dot bg-cyan-400 text-cyan-400" />
                        {data!.timeHint}
                      </span>
                      {isLowImportance && (
                        <span className="signal-chip">
                          <span className="signal-dot bg-slate-400 text-slate-400" />
                          今日非关键决策日
                        </span>
                      )}
                    </div>

                    {data?.behaviorRadar && (
                      <div className="space-y-2 rounded-sm border border-border/60 bg-card/50 p-3">
                        <div className="eyebrow mb-2">Behavior Radar</div>
                        {[
                          { key: "investment", icon: "📈", label: "投资" },
                          { key: "travel", icon: "🚗", label: "出行" },
                          { key: "publicRole", icon: "🧩", label: "公开角色" },
                        ].map((entry) => {
                          const radarEntry =
                            data.behaviorRadar[entry.key as keyof BehaviorRadar];
                          if (!radarEntry) return null;

                          return (
                            <div
                              key={entry.key}
                              className="rounded-sm border border-border/50 bg-muted/15 p-3"
                            >
                              <div className="mb-1 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                <span className="font-semibold">
                                  {entry.icon} {entry.label}
                                </span>
                                <span>{statusLabelMap[radarEntry.status] || radarEntry.status}</span>
                              </div>
                              <div className="text-[13px] leading-6 text-foreground/92">
                                {radarEntry.summary}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : !birthdate ? (
                  <div className="text-sm leading-6 text-muted-foreground">
                    点击右上角设置生日，解锁今天的运势判断和行为雷达。
                  </div>
                ) : (
                  <div className="text-sm leading-6 text-destructive">
                    数据格式异常或缺失，请稍后再试。
                  </div>
                )}

                <div className="mt-4 text-[11px] leading-5 text-muted-foreground/75">
                  {disclaimerText}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FortuneConfigModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        currentBirthdate={birthdate ?? undefined}
        onSave={handleSave}
      />
    </>
  );
}
