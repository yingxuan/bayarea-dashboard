import { useEffect, useMemo, useState } from "react";

import { Info, Settings } from "lucide-react";

import FortuneConfigModal from "@/components/FortuneConfigModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { config } from "@/config";

const STORAGE_KEY = "uf_fortune_birthdate";
const DEFAULT_DISCLAIMER = "本功能仅供娱乐参考，不构成医疗或投资建议。";

interface FortuneData {
  birthdate: string;
  today: string;
  generated_at: string;
  summary_line: string;
  key_tip: string;
  disclaimer: string;
  day: Record<string, any>;
  dayCompact?: {
    headline: string;
    bullets: string[];
  };
  meta?: {
    schemaVariant?: string;
    usedDefaults?: boolean;
  };
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

  const bullets = useMemo(() => {
    if (data?.dayCompact?.bullets?.length === 4) return data.dayCompact.bullets;
    return [];
  }, [data]);

  const showSummary = useMemo(() => !!data && !loading && !error, [data, loading, error]);

  const summaryLine = showSummary ? data?.dayCompact?.headline || data?.summary_line : "";
  const keyTip = showSummary ? data?.key_tip : "";

  const currentTip = error
    ? "读取今日运势失败"
    : !birthdate
    ? "请先点击齿轮设置生日"
    : loading
    ? "加载中..."
    : keyTip || "";

  return (
    <>
      <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-lg font-semibold uppercase text-muted-foreground">
              今日运势
            </div>
            <div className="text-base font-semibold text-foreground">
              {loading ? (
                <Skeleton className="h-4 w-60" />
              ) : (
                <span className="leading-snug">{summaryLine}</span>
              )}
            </div>
            <div className="mt-1 text-sm font-medium text-muted-foreground">
              {keyTip || currentTip}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-full border border-border/50 bg-card px-2 py-1 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            ⚙️ 配置生日
          </button>
        </div>
        {bullets.length === 4 && (
          <div className="mt-4 space-y-1 text-sm text-foreground">
            {bullets.map((b) => (
              <div key={b} className="flex items-start gap-2">
                <span className="mt-[2px]">•</span>
                <span className="leading-tight">{b}</span>
              </div>
            ))}
          </div>
        )}
        {process.env.NODE_ENV !== "production" && data?.meta && (
          <div className="mt-3 text-[10px] text-muted-foreground">
            schema={data.meta.schemaVariant || "unknown"} defaults={String(data.meta.usedDefaults ?? false)}
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center justify-between rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            <span>拉取失败：{error}</span>
            <button
              type="button"
              onClick={() => setRetryKey((prev) => prev + 1)}
              className="text-primary underline"
            >
              重试
            </button>
          </div>
        )}
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
