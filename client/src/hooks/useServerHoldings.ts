/**
 * Hook for managing server-side holdings (authenticated users)
 * Syncs holdings with server and provides local state management
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { config } from "@/config";
import type { Holding } from "./useHoldings";

interface ServerHoldingsResult {
  holdings: Holding[];
  isLoaded: boolean;
  ytdBaseline: number | null;
  saveHoldings: (holdings: Holding[]) => Promise<void>;
  updateYtdBaseline: (value: number | null) => Promise<void>;
  isError: boolean;
  isSaving: boolean;
}

export function useServerHoldings(): ServerHoldingsResult {
  const { isAuthenticated } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ytdBaseline, setYtdBaseline] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch holdings from server
  const fetchHoldings = useCallback(async () => {
    if (!isAuthenticated) {
      setHoldings([]);
      setIsLoaded(true);
      return;
    }

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/portfolio/holdings`, {
        credentials: "include",
      });

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
        setIsError(false);
      } else if (response.status === 401) {
        setHoldings([]);
      } else {
        setIsError(true);
      }
    } catch (error) {
      console.error("[useServerHoldings] Failed to fetch holdings:", error);
      setIsError(true);
    } finally {
      setIsLoaded(true);
    }
  }, [isAuthenticated]);

  // Fetch settings from server
  const fetchSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setYtdBaseline(null);
      return;
    }

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/portfolio/settings`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setYtdBaseline(data.settings.ytdBaseline);
        }
      }
    } catch (error) {
      console.error("[useServerHoldings] Failed to fetch settings:", error);
    }
  }, [isAuthenticated]);

  // Load data on mount and auth change
  useEffect(() => {
    setIsLoaded(false);
    fetchHoldings();
    fetchSettings();
  }, [fetchHoldings, fetchSettings]);

  // Save holdings to server
  const saveHoldings = useCallback(
    async (newHoldings: Holding[]) => {
      if (!isAuthenticated) return;

      setIsSaving(true);
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/portfolio/holdings`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            holdings: newHoldings.map((h) => ({
              ticker: h.ticker,
              shares: h.shares,
              avgCost: h.avgCost,
            })),
          }),
        });

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
          setIsError(false);
        } else {
          setIsError(true);
          throw new Error("Failed to save holdings");
        }
      } catch (error) {
        console.error("[useServerHoldings] Failed to save holdings:", error);
        setIsError(true);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [isAuthenticated]
  );

  // Update YTD baseline on server
  const updateYtdBaseline = useCallback(
    async (value: number | null) => {
      if (!isAuthenticated) return;

      try {
        const response = await fetch(`${config.apiBaseUrl}/api/portfolio/settings`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
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
        console.error("[useServerHoldings] Failed to update YTD baseline:", error);
      }
    },
    [isAuthenticated]
  );

  return {
    holdings,
    isLoaded,
    ytdBaseline,
    saveHoldings,
    updateYtdBaseline,
    isError,
    isSaving,
  };
}
