import { useEffect, useMemo, useState } from "react";

import FortuneConfigModal from "@/components/FortuneConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";

const STORAGE_KEY = "uf_fortune_birthdate";
const DEFAULT_DISCLAIMER = "本功能仅供娱乐参考，不构成医疗或投资建议。";

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
  ) : (
    "数据异常"
  );

  return (
    <>
      <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-lg font-semibold uppercase text-muted-foreground">
              今日运势
            </div>
            <div
              className={`text-base font-semibold leading-snug ${
                isLowImportance ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {headlineContent}
            </div>
            <div className="text-xs text-muted-foreground/70">今日吉凶提示（基于生辰八字）</div>
            <div className="mt-1 text-sm font-medium text-muted-foreground">{statusMessage}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">今日已生成</span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-full border border-border/50 bg-card px-2 py-1 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              ⚙️ 配置生日
            </button>
          </div>
        </div>
        {fortuneValid ? (
          <div className="mt-4 space-y-3 text-sm text-foreground">
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
              <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-card/70 p-3 text-sm text-foreground">
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
                    <div key={entry.key} className="space-y-1 rounded-xl border border-border/50 bg-muted/20 p-2">
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
        ) : (
          <div className="mt-4 text-sm text-destructive">数据格式异常或缺失，请稍后再试</div>
        )}
        <div className="mt-4 text-[11px] text-muted-foreground">{disclaimerText}</div>
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
