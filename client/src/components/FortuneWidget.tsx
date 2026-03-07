import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

import FortuneConfigModal from "@/components/FortuneConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";

const STORAGE_KEY = "uf_fortune_birthdate";
const DEFAULT_DISCLAIMER = "本功能仅供娱乐参考，不构成医疗或投资建议。";

const DAILY_QUOTES = [
  "复利是第八大奇迹，不懂它的人为它付钱，懂它的人靠它赚钱。",
  "市场短期是投票机，长期是称重机。— 格雷厄姆",
  "风险来自于你不知道自己在做什么。— 巴菲特",
  "最好的投资是投资自己。知识不会随市场波动。",
  "你无法预测，但你可以准备。— Howard Marks",
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
  "持有好公司的时间越长，复利的力量越大。",
  "市场不奖励努力，只奖励正确。",
  "资产配置决定90%的长期收益。",
  "现金是期权，不是负担。",
  "慢慢变富，是最快的致富方式。",
  "每一次回调都是市场给你的第二次机会。",
  "不懂估值，就不要谈价值投资。",
  "股市是把钱从没耐心的人转移给有耐心的人。",
  "你的净资产 = 你赚到的 - 你花掉的。",
  "一个好的系统胜过一百个好的决策。",
  "投资最大的敌人是自己的情绪。",
  "买股票就是买公司，买公司就是买未来。",
  "涨时不兴奋，跌时不恐惧，才是真正的投资者。",
  "不预测市场方向，只管理自己的仓位。",
  "成功的投资者都有一个共同点：不需要被市场认可。",
  "好公司在熊市里变得更好，坏公司在牛市里暴露本色。",
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

export default function FortuneWidget() {
  const [birthdate, setBirthdate] = useState<string | null>(null);
  const [data, setData] = useState<FortuneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const disclaimerText = data?.disclaimer || DEFAULT_DISCLAIMER;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setBirthdate(stored);
    }
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
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (!contentType.includes("application/json")) {
          throw new Error("服务器未返回 JSON，请稍后再试");
        }
        return response.json();
      })
      .then((result: FortuneData) => {
        setData(result);
      })
      .catch((err) => {
        if (err.name === "AbortError") {
          return;
        }
        setError(err.message || "加载失败，请重试");
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      abortController.abort();
    };
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
    ? "请先点击齿轮设置生日"
    : loading
    ? "加载中..."
    : fortuneValid
    ? "今日已生成"
    : "数据格式异常，请稍后重试";

  const isLowImportance = data?.importance === "low";
  const headlineContent = loading ? (
    <Skeleton className="h-4 w-60" />
  ) : fortuneValid && data ? (
    data.headline
  ) : !birthdate ? (
    getDailyQuote()
  ) : (
    "数据异常"
  );

  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="rounded-sm border border-border/40 bg-card p-4 shadow-md">
        {/* Collapsed header row — always visible */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex flex-1 items-center gap-3 text-left"
          >
            <div className="text-sm font-semibold uppercase text-muted-foreground whitespace-nowrap">
              今日运势
            </div>
            <div
              className={`flex-1 truncate text-sm font-medium leading-snug ${
                isLowImportance ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {headlineContent}
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-full border border-border/50 bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary flex-shrink-0"
          >
            ⚙️
          </button>
        </div>

        {/* Expanded content */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="pt-3">
                <div className="text-xs text-muted-foreground/70 mb-2">今日吉凶提示（基于生辰八字） · {statusMessage}</div>
                {fortuneValid ? (
                  <div className="space-y-3 text-sm text-foreground">
                    <p className="text-base">{data!.verdict}</p>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-400">✅</span>
                        <span className="leading-tight">{data!.do}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-destructive">⛔</span>
                        <span className="leading-tight">{data!.dont}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <span>⏰</span>
                      <span>{data!.timeHint}</span>
                    </div>
                    {isLowImportance && (
                      <div className="text-[11px] text-muted-foreground">今日非关键决策日</div>
                    )}
                    {data?.behaviorRadar && (
                      <div className="mt-4 space-y-2 rounded-sm border border-border/60 bg-card/70 p-3 text-sm text-foreground">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">行为雷达</div>
                        {[
                          { key: "investment", icon: "📈", label: "投资" },
                          { key: "travel", icon: "🚗", label: "出行" },
                          { key: "publicRole", icon: "🧩", label: "公开角色" },
                        ].map((entry) => {
                          const radarEntry = data.behaviorRadar[entry.key as keyof BehaviorRadar];
                          if (!radarEntry) {
                            return null;
                          }
                          return (
                            <div key={entry.key} className="space-y-1 rounded-sm border border-border/50 bg-muted/20 p-2">
                              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                                <span className="font-semibold">
                                  {entry.icon} {entry.label}
                                </span>
                                <span>
                                  {
                                    {
                                      none: "暂无",
                                      actionable: "可行动",
                                      risk: "风险",
                                      safe: "安全",
                                      caution: "需谨慎",
                                    }[radarEntry.status] || radarEntry.status
                                  }
                                </span>
                              </div>
                              <div className="text-[13px] text-foreground">{radarEntry.summary}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : !birthdate ? (
                  <div className="text-sm text-muted-foreground">点击右上角齿轮设置生日，解锁今日运势分析。</div>
                ) : (
                  <div className="text-sm text-destructive">数据格式异常或缺失，请稍后再试</div>
                )}
                <div className="mt-3 text-[11px] text-muted-foreground">{disclaimerText}</div>
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
