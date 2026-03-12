import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import FortuneConfigModal from "@/components/FortuneConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";

const STORAGE_KEY = "uf_fortune_birthdate";
const DEFAULT_DISCLAIMER = "本功能仅供娱乐参考，不构成医疗、法律或投资建议。";

const DAILY_QUOTES = [
  "复利是慢节奏生活里最少被高估的力量。",
  "市场会摇摆，节奏不要跟着乱。",
  "今天适合判断，不适合表演。",
  "先守住睡眠、现金流和心情，再谈效率。",
  "你无法预测一切，但可以先准备好下一步。",
  "别让短期波动偷走长期计划。",
  "在高压环境里，清醒比兴奋更稀缺。",
  "今天适合做更小、更稳的决定。",
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
          throw new Error("服务返回异常，请稍后再试");
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
    ? "今日运势读取失败"
    : !birthdate
      ? "先设置生日"
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
    "今天先保守一点"
  );

  return (
    <>
      <div className="hero-panel rounded-[1.2rem] p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="section-kicker mb-3">
                <div className="eyebrow">Fortune</div>
                <span className="briefing-badge">Lightweight ritual</span>
              </div>
              <div className="text-[15px] font-semibold text-foreground">今天的情绪和节奏提示</div>
              <div
                className={`mt-2 text-sm leading-6 ${
                  isLowImportance ? "text-muted-foreground" : "text-foreground/90"
                }`}
              >
                {headlineContent}
              </div>
              <div className={`mt-2 text-[11px] uppercase tracking-[0.16em] ${importanceTone}`}>
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
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
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="mb-3 text-xs text-muted-foreground/72">
                  这是一个轻量 daily ritual，用来给今天一个节奏感，不是严肃预测工具。
                </div>

                {fortuneValid && data ? (
                  <div className="space-y-4 text-sm text-foreground">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-[15px] leading-7">
                      {data.verdict}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-500/18 bg-emerald-500/8 p-4">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                          宜做
                        </div>
                        <div className="leading-6 text-foreground/92">{data.do}</div>
                      </div>
                      <div className="rounded-2xl border border-rose-500/18 bg-rose-500/8 p-4">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-rose-300/80">
                          慎做
                        </div>
                        <div className="leading-6 text-foreground/92">{data.dont}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="signal-chip">
                        <span className="signal-dot bg-cyan-400 text-cyan-400" />
                        {data.timeHint}
                      </span>
                      {isLowImportance && (
                        <span className="signal-chip">
                          <span className="signal-dot bg-slate-400 text-slate-400" />
                          适合轻决策日
                        </span>
                      )}
                    </div>

                    {data.behaviorRadar && (
                      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="eyebrow mb-2">Behavior Radar</div>
                        {[
                          { key: "investment", label: "投资" },
                          { key: "travel", label: "出行" },
                          { key: "publicRole", label: "公开角色" },
                        ].map((entry) => {
                          const radarEntry = data.behaviorRadar[entry.key as keyof BehaviorRadar];
                          if (!radarEntry) return null;

                          return (
                            <div
                              key={entry.key}
                              className="rounded-2xl border border-white/8 bg-black/10 p-3"
                            >
                              <div className="mb-1 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                <span className="font-semibold">{entry.label}</span>
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
                    点击右上角设置生日，解锁今天的运势提示和行为雷达。
                  </div>
                ) : (
                  <div className="text-sm leading-6 text-destructive">
                    今日内容还没准备好，稍后再试。
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
