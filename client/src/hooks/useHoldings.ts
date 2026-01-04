/**
 * Hook for managing user holdings (stocks portfolio)
 * Uses localStorage for persistence
 */

import { useState, useEffect, useCallback } from "react";
import { traceHoldingsWrite } from "@/utils/holdingsTracer";

export interface Holding {
  id: string; // Unique ID for each holding
  ticker: string; // Stock ticker (e.g., "AAPL")
  shares: number; // Number of shares
  avgCost?: number; // Average cost per share (optional)
}

const STORAGE_KEY = "bayareaDash.holdings.v1";
const YTD_BASELINE_KEY = "bayareaDash.ytdBaseline.v1";

/**
 * Load holdings from localStorage
 */
function loadHoldings(): Holding[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    // Validate structure
    return parsed.filter(
      (h): h is Holding =>
        typeof h === "object" &&
        h !== null &&
        typeof h.ticker === "string" &&
        typeof h.shares === "number" &&
        h.shares > 0 &&
        (h.avgCost === undefined || (typeof h.avgCost === "number" && h.avgCost > 0))
    );
  } catch (error) {
    console.error("[useHoldings] Failed to load holdings:", error);
    return [];
  }
}

/**
 * Save holdings to localStorage
 */
function saveHoldings(holdings: Holding[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch (error) {
    console.error("[useHoldings] Failed to save holdings:", error);
  }
}

/**
 * Generate unique ID for a holding
 */
function generateId(): string {
  return `holding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Normalize ticker (uppercase + trim)
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/**
 * Validate holding data
 */
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

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [ytdBaseline, setYtdBaseline] = useState<number | null>(null);

  // Load holdings and ytdBaseline on mount
  useEffect(() => {
    const loaded = loadHoldings();
    traceHoldingsWrite('init_from_storage', loaded);
    setHoldings(loaded);
    
    // Load ytdBaseline
    try {
      const stored = localStorage.getItem(YTD_BASELINE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed > 0) {
          setYtdBaseline(parsed);
        }
      }
    } catch (error) {
      console.error("[useHoldings] Failed to load ytdBaseline:", error);
    }
    
    setIsLoaded(true);
  }, []);

  // Save holdings whenever they change
  useEffect(() => {
    if (isLoaded) {
      traceHoldingsWrite('save_to_storage', holdings);
      saveHoldings(holdings);
    }
  }, [holdings, isLoaded]);

  const addHolding = useCallback((holding: Omit<Holding, "id">) => {
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

    setHoldings((prev) => {
      const newHoldings = [...prev, normalized];
      traceHoldingsWrite('addHolding', newHoldings);
      return newHoldings;
    });
    return normalized;
  }, []);

  const updateHolding = useCallback((id: string, updates: Partial<Omit<Holding, "id">>) => {
    const validation = validateHolding(updates);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    setHoldings((prev) => {
      const newHoldings = prev.map((h) => {
        if (h.id === id) {
          return {
            ...h,
            ...updates,
            ticker: updates.ticker ? normalizeTicker(updates.ticker) : h.ticker,
          };
        }
        return h;
      });
      traceHoldingsWrite('updateHolding', newHoldings);
      return newHoldings;
    });
  }, []);

  const deleteHolding = useCallback((id: string) => {
    setHoldings((prev) => {
      const newHoldings = prev.filter((h) => h.id !== id);
      traceHoldingsWrite('deleteHolding', newHoldings);
      return newHoldings;
    });
  }, []);

  const clearHoldings = useCallback(() => {
    traceHoldingsWrite('clearHoldings', []);
    setHoldings([]);
  }, []);

  const importHoldings = useCallback((data: Holding[], merge: boolean = false) => {
    // Validate all holdings
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
      // Merge: combine with existing, update duplicates by ticker
      // Ensure new array reference (no mutation)
      setHoldings((prev) => {
        const merged = [...prev];
        for (const newHolding of validHoldings) {
          const existingIndex = merged.findIndex(
            (h) => h.ticker === newHolding.ticker
          );
          if (existingIndex >= 0) {
            merged[existingIndex] = newHolding;
          } else {
            merged.push(newHolding);
          }
        }
        traceHoldingsWrite('importHoldings_merge', merged);
        return merged;
      });
    } else {
      // Replace: clear and set new holdings
      // Ensure new array reference (no mutation) - critical for React reactivity
      const newHoldings = validHoldings.map(h => ({ ...h })); // Deep copy
      traceHoldingsWrite('importHoldings_replace', newHoldings);
      setHoldings(newHoldings);
    }
  }, []);

  const exportHoldings = useCallback(() => {
    return JSON.stringify(holdings, null, 2);
  }, [holdings]);

  const addExampleHoldings = useCallback(() => {
    const examples: Omit<Holding, "id">[] = [
      { ticker: "AAPL", shares: 10, avgCost: 150 },
      { ticker: "MSFT", shares: 5, avgCost: 300 },
      { ticker: "NVDA", shares: 5, avgCost: 400 },
    ];
    examples.forEach((ex) => {
      try {
        addHolding(ex);
      } catch (error) {
        console.error("[useHoldings] Failed to add example:", error);
      }
    });
  }, [addHolding]);

  const updateYtdBaseline = useCallback((value: number | null) => {
    if (value === null || value <= 0) {
      localStorage.removeItem(YTD_BASELINE_KEY);
      setYtdBaseline(null);
    } else {
      localStorage.setItem(YTD_BASELINE_KEY, value.toString());
      setYtdBaseline(value);
    }
  }, []);

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
  };
}
