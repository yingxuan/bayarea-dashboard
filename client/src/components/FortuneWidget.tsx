import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import FortuneConfigModal from "@/components/FortuneConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";

const STORAGE_KEY = "uf_fortune_birthdate";

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
  caution: "谨慎",
};

function getFortuneLevel(data: FortuneData | null): {
  label: "大吉" | "吉" | "平" | "凶" | "大凶";
  tone: string;
} | null {
  if (!data) return null;

  const radarEntries = Object.values(data.behaviorRadar || {});
  let score = 0;

  for (const entry of radarEntries) {
    if (entry.status === "safe" || entry.status === "actionable") score += 1;
    if (entry.status === "risk" || entry.status === "caution") score -= 1;
  }

  if (data.importance === "high") {
    score += score > 0 ? 1 : score < 0 ? -1 : 0;
  }

  if (score >= 3) return { label: "大吉", tone: "text-emerald-300" };
  if (score >= 1) return { label: "吉", tone: "text-lime-300" };
  if (score <= -3) return { label: "大凶", tone: "text-rose-300" };
  if (score <= -1) return { label: "凶", tone: "text-amber-300" };
  return { label: "平", tone: "text-muted-foreground" };
}

function buildSummaryText(data: FortuneData | null): string {
  if (!data) return getDailyQuote();
  return `【${getFortuneLevel(data)?.label || "平"}】宜${data.do}，忌${data.dont}`;
}

export default function FortuneWidget() {
  const [birthdate, setBirthdate] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const [data, setData] = useState<FortuneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!birthdate) return;

    const abortController = new AbortController();
    const selectedBirthdate = birthdate;

    async function loadFortune() {
      setLoading(true);
      setError(null);

      const url = new URL(`${config.apiBaseUrl}/api/fortune`, window.location.origin);
      url.searchParams.set("birthdate", selectedBirthdate);

      try {
        const response = await fetch(url.toString(), {
          signal: abortController.signal,
          cache: "default",
        });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!contentType.includes("application/json")) {
          throw new Error("服务返回异常，请稍后再试");
        }

        const result: FortuneData = await response.json();
        setData(result);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "加载失败，请重试");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    loadFortune();
    return () => abortController.abort();
  }, [birthdate, retryKey]);

  const handleSave = (value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
    setBirthdate(value);
    setRetryKey((prev) => prev + 1);
  };

  const fortuneValid = useMemo(
    () =>
      !!data &&
      !loading &&
      !error &&
      !!data.headline &&
      !!data.verdict &&
      !!data.do &&
      !!data.dont &&
      !!data.timeHint &&
      !!data.importance &&
      !!data.behaviorRadar,
    [data, loading, error],
  );

  const statusMessage = error
    ? "读取失败"
    : !birthdate
      ? "先设置生日"
      : loading
        ? "生成中"
        : fortuneValid
          ? "已生成"
          : "数据异常";

  const statusTone =
    data?.importance === "high"
      ? "text-amber-300"
      : data?.importance === "medium"
        ? "text-cyan-300"
        : "text-muted-foreground";

  const summaryContent = loading ? (
    <Skeleton className="h-4 w-64" />
  ) : fortuneValid && data ? (
    buildSummaryText(data)
  ) : !birthdate ? (
    "设置生日后可生成今日运势。"
  ) : (
    "今天先保守一点。"
  );

  return (
    <>
      <div className="rounded-[1rem] border border-white/10 bg-white/[0.045] px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <div className="shrink-0 rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-200/85">
              运势
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-foreground/88">{summaryContent}</div>
            </div>
            <div className={`hidden text-[11px] uppercase tracking-[0.16em] md:block ${statusTone}`}>
              {statusMessage}
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-3 border-t border-white/10 pt-3">
                {fortuneValid && data ? (
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        今日判断
                      </div>
                      <div className="text-base font-semibold text-foreground/92">{data.headline}</div>
                      <div className="mt-2 text-sm leading-6 text-foreground/92">{data.verdict}</div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-[1rem] border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground/78">
                        {data.timeHint}
                      </div>
                      <div className="rounded-[1rem] border border-white/10 bg-white/5 p-3">
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
                              className="border-b border-white/8 py-2 first:pt-0 last:border-b-0 last:pb-0"
                            >
                              <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                <span>{entry.label}</span>
                                <span>{statusLabelMap[radarEntry.status] || radarEntry.status}</span>
                              </div>
                              <div className="text-sm leading-6 text-foreground/92">{radarEntry.summary}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : !birthdate ? (
                  <div className="text-sm leading-6 text-muted-foreground">
                    点右侧设置生日，解锁今天的运势提示。
                  </div>
                ) : (
                  <div className="text-sm leading-6 text-destructive">今日内容还没准备好，稍后再试。</div>
                )}
              </div>
            </motion.div>
          ) : null}
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
