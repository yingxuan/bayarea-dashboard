/**
 * Auth-aware Holdings Hook
 * Automatically uses server storage when authenticated, localStorage otherwise
 * Re-exports all the same methods as useHoldings for compatibility
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { config } from "@/config";
import { traceHoldingsWrite } from "@/utils/holdingsTracer";
import { toast } from "sonner";

export interface Holding {
  id: string;
  ticker: string;
  shares: number;
  avgCost?: number;
}

const STORAGE_KEY = "bayareaDash.holdings.v1";
const YTD_BASELINE_KEY = "bayareaDash.ytdBaseline.v1";

function generateId(): string {
  return `holding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function validateHolding(holding: Partial<Holding>): { valid: boolean; error?: string } {
  if (!holding.ticker || typeof holding.ticker !== "string" || holding.ticker.trim() === "") {
    return { valid: false, error: "Ticker is required" };
  }
  if (typeof holding.shares !== "number" || holding.shares <= 0) {
    return { valid: false, error: "Shares must be a positive number" };
  }
  if (holding.avgCost !== undefined) {
    if (typeof holding.avgCost !== "number" || holding.avgCost <= 0) {
      return { valid: false, error: "Average cost must be a positive number" };
    }
  }
  return { valid: true };
}

export function useAuthAwareHoldings() {
  const { isAuthenticated, isLoading: authLoading, refreshUser, invalidateSession } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [ytdBaseline, setYtdBaseline] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load holdings (server or local)
  const loadHoldings = useCallback(async () => {
    if (authLoading) return;

    if (isAuthenticated) {
      // Load from server
      try {
        const [holdingsRes, settingsRes] = await Promise.all([
          fetch(`${config.apiBaseUrl}/api/portfolio/holdings`, { credentials: "include" }),
          fetch(`${config.apiBaseUrl}/api/portfolio/settings`, { credentials: "include" }),
        ]);

        if (holdingsRes.ok) {
          const data = await holdingsRes.json();
          if (data.success && Array.isArray(data.holdings)) {
            setHoldings(
              data.holdings.map((h: any) => ({
                id: h.id,
                ticker: h.ticker,
                shares: h.shares,
                avgCost: h.avgCost,
              }))
            );
          }
        }

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.success) {
            setYtdBaseline(data.settings.ytdBaseline);
          }
        }
      } catch (error) {
        console.error("[useAuthAwareHoldings] Failed to load from server:", error);
      }
    } else {
      // Load from localStorage
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(
              (h): h is Holding =>
                typeof h === "object" &&
                h !== null &&
                typeof h.ticker === "string" &&
                typeof h.shares === "number" &&
                h.shares > 0
            );
            setHoldings(valid);
          }
        }

        const ytdStored = localStorage.getItem(YTD_BASELINE_KEY);
        if (ytdStored) {
          const parsed = parseFloat(ytdStored);
          if (!isNaN(parsed) && parsed > 0) {
            setYtdBaseline(parsed);
          }
        }
      } catch (error) {
        console.error("[useAuthAwareHoldings] Failed to load from localStorage:", error);
      }
    }

    setIsLoaded(true);
  }, [isAuthenticated, authLoading]);

  // Load on mount and when auth changes
  useEffect(() => {
    setIsLoaded(false);
    loadHoldings();
  }, [loadHoldings]);

  // Save holdings. Returns Promise so callers can await and handle errors.
  const saveHoldings = useCallback(
    async (newHoldings: Holding[]): Promise<void> => {
      if (isAuthenticated) {
        const previousHoldings = holdings;
        setHoldings(newHoldings); // Optimistic update
        setIsSyncing(true);
        try {
          let response = await fetch(`${config.apiBaseUrl}/api/portfolio/holdings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              holdings: newHoldings.map((h) => {
                const payload: { ticker: string; shares: number; avgCost?: number } = {
                  ticker: h.ticker,
                  shares: h.shares,
                };
                if (typeof h.avgCost === "number" && h.avgCost >= 0) {
                  payload.avgCost = h.avgCost;
                }
                return payload;
              }),
            }),
          });

          // On 401: try refresh then retry once; if still 401, save to local and invalidate session
          if (response.status === 401) {
            await refreshUser();
            response = await fetch(`${config.apiBaseUrl}/api/portfolio/holdings`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                holdings: newHoldings.map((h) => {
                  const payload: { ticker: string; shares: number; avgCost?: number } = {
                    ticker: h.ticker,
                    shares: h.shares,
                  };
                  if (typeof h.avgCost === "number" && h.avgCost >= 0) {
                    payload.avgCost = h.avgCost;
                  }
                  return payload;
                }),
              }),
            });
          }

          if (response.status === 401) {
            // Session invalid; save to localStorage and clear auth so UI updates
            invalidateSession();
            setHoldings(newHoldings);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(newHoldings));
              traceHoldingsWrite("save_after_401", newHoldings);
            } catch {
              // ignore
            }
            setIsSyncing(false);
            toast.info(
              "登录已过期，持仓已保存到本地，重新登录后可同步到云端"
            );
            return;
          }

          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.holdings)) {
              setHoldings(
                data.holdings.map((h: any) => ({
                  id: h.id,
                  ticker: h.ticker,
                  shares: h.shares,
                  avgCost: h.avgCost,
                }))
              );
            }
          } else {
            setHoldings(previousHoldings); // Revert on failure
            let message = "保存失败，请重试";
            try {
              const data = await response.json();
              if (data && typeof data.message === "string") message = data.message;
              else if (data && typeof data.error === "string") message = data.error;
            } catch {
              // ignore JSON parse error
            }
            throw new Error(message);
          }
        } catch (error) {
          setHoldings(previousHoldings); // Revert on failure
          console.error("[useAuthAwareHoldings] Failed to save to server:", error);
          throw error;
        } finally {
          setIsSyncing(false);
        }
      } else {
        // Save to localStorage
        setHoldings(newHoldings);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newHoldings));
          traceHoldingsWrite("save_to_storage", newHoldings);
        } catch (error) {
          console.error("[useAuthAwareHoldings] Failed to save to localStorage:", error);
        }
        return Promise.resolve();
      }
    },
    [isAuthenticated, holdings, refreshUser, invalidateSession]
  );

  // Individual holding operations
  const addHolding = useCallback(
    (holding: Omit<Holding, "id">) => {
      const validation = validateHolding(holding);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const normalized: Holding = {
        id: generateId(),
        ticker: normalizeTicker(holding.ticker),
        shares: holding.shares,
        avgCost: holding.avgCost,
      };

      const newHoldings = [...holdings, normalized];
      saveHoldings(newHoldings);
      return normalized;
    },
    [holdings, saveHoldings]
  );

  const updateHolding = useCallback(
    (id: string, updates: Partial<Omit<Holding, "id">>) => {
      const newHoldings = holdings.map((h) => {
        if (h.id === id) {
          return {
            ...h,
            ...updates,
            ticker: updates.ticker ? normalizeTicker(updates.ticker) : h.ticker,
          };
        }
        return h;
      });
      saveHoldings(newHoldings);
    },
    [holdings, saveHoldings]
  );

  const deleteHolding = useCallback(
    (id: string): Promise<void> => {
      const newHoldings = holdings.filter((h) => h.id !== id);
      return saveHoldings(newHoldings);
    },
    [holdings, saveHoldings]
  );

  const clearHoldings = useCallback(() => {
    saveHoldings([]);
  }, [saveHoldings]);

  const importHoldings = useCallback(
    (data: Holding[], merge: boolean = false): Promise<void> => {
      const validHoldings: Holding[] = [];
      for (const h of data) {
        const validation = validateHolding(h);
        if (validation.valid) {
          validHoldings.push({
            id: h.id || generateId(),
            ticker: normalizeTicker(h.ticker),
            shares: h.shares,
            avgCost: h.avgCost,
          });
        }
      }

      if (merge) {
        const merged = [...holdings];
        for (const newHolding of validHoldings) {
          const existingIndex = merged.findIndex((h) => h.ticker === newHolding.ticker);
          if (existingIndex >= 0) {
            merged[existingIndex] = newHolding;
          } else {
            merged.push(newHolding);
          }
        }
        return saveHoldings(merged);
      } else {
        return saveHoldings(validHoldings);
      }
    },
    [holdings, saveHoldings]
  );

  const exportHoldings = useCallback(() => {
    return JSON.stringify(holdings, null, 2);
  }, [holdings]);

  const addExampleHoldings = useCallback(() => {
    const examples: Omit<Holding, "id">[] = [
      { ticker: "AAPL", shares: 10, avgCost: 150 },
      { ticker: "MSFT", shares: 5, avgCost: 300 },
      { ticker: "NVDA", shares: 5, avgCost: 400 },
    ];
    const newExamples = examples.map((ex) => ({
      id: generateId(),
      ticker: normalizeTicker(ex.ticker),
      shares: ex.shares,
      avgCost: ex.avgCost,
    }));
    saveHoldings([...holdings, ...newExamples]);
  }, [holdings, saveHoldings]);

  const updateYtdBaseline = useCallback(
    async (value: number | null) => {
      if (isAuthenticated) {
        // Save to server
        try {
          const response = await fetch(`${config.apiBaseUrl}/api/portfolio/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ytdBaseline: value }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setYtdBaseline(data.settings.ytdBaseline);
            }
          }
        } catch (error) {
          console.error("[useAuthAwareHoldings] Failed to update YTD baseline:", error);
        }
      } else {
        // Save to localStorage
        if (value === null || value <= 0) {
          localStorage.removeItem(YTD_BASELINE_KEY);
          setYtdBaseline(null);
        } else {
          localStorage.setItem(YTD_BASELINE_KEY, value.toString());
          setYtdBaseline(value);
        }
      }
    },
    [isAuthenticated]
  );

  return {
    holdings,
    isLoaded,
    ytdBaseline,
    addHolding,
    updateHolding,
    deleteHolding,
    clearHoldings,
    importHoldings,
    exportHoldings,
    addExampleHoldings,
    updateYtdBaseline,
    isSyncing,
    isAuthenticated,
  };
}
