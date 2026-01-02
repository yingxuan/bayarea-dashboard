/**
 * Hook for calculating portfolio summary metrics
 * Single source of truth for all portfolio calculations
 */

import { useMemo } from "react";
import { Holding } from "./useHoldings";

export interface QuoteData {
  price: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  status: string;
}

export interface PortfolioMetrics {
  portfolioValue: number;
  dailyChangeAmount: number;
  dailyChangePercent: number;
  ytdPercent: number | null;
}

/**
 * Calculate portfolio summary metrics from holdings and quotes
 * This is the single source of truth for all portfolio calculations
 */
export function usePortfolioSummary(
  holdings: Holding[],
  quotesData: Record<string, QuoteData>,
  ytdBaseline: number | null
): PortfolioMetrics {
  // Create stable keys for dependencies to prevent unnecessary recalculations
  const holdingsKey = useMemo(() => {
    if (holdings.length === 0) return 'empty';
    // Create stable key from holdings (only include relevant fields, sorted for consistency)
    return JSON.stringify(
      holdings
        .map(h => ({
          id: h.id,
          ticker: h.ticker.toUpperCase(),
          shares: Number(h.shares),
        }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker))
    );
  }, [holdings]);

  const quotesKey = useMemo(() => {
    const tickers = Object.keys(quotesData).sort();
    return JSON.stringify(
      tickers.map(t => ({
        ticker: t,
        price: quotesData[t]?.price,
        prevClose: quotesData[t]?.prevClose,
        change: quotesData[t]?.change,
        changePercent: quotesData[t]?.changePercent,
        status: quotesData[t]?.status,
      }))
    );
  }, [quotesData]);

  return useMemo(() => {
    // Initialize accumulators
    let portfolioValue = 0;
    let dailyChangeAmount = 0;
    let totalWeightedChangePercent = 0;
    let totalWeight = 0;

    // Single pass through holdings to calculate all metrics
    for (const holding of holdings) {
      const tickerUpper = holding.ticker.toUpperCase();
      const quote = quotesData[tickerUpper];
      
      // Validate shares
      const shares = Number(holding.shares);
      if (isNaN(shares) || shares <= 0) {
        continue;
      }

      // Validate quote data
      if (!quote || quote.status !== 'ok' || !quote.price || quote.price <= 0) {
        continue;
      }

      const price = Number(quote.price);
      if (isNaN(price) || price <= 0) {
        continue;
      }

      // Calculate market value: shares * price
      const marketValue = shares * price;
      portfolioValue += marketValue;

      // Calculate daily change: shares * (price - prevClose)
      let holdingChangeAmount = 0;
      let holdingChangePercent: number | null = null;

      if (quote.prevClose !== undefined) {
        const prevClose = Number(quote.prevClose);
        if (!isNaN(prevClose) && prevClose > 0) {
          const priceChange = price - prevClose;
          holdingChangeAmount = shares * priceChange;
          holdingChangePercent = ((price - prevClose) / prevClose) * 100;
        }
      } else if (quote.change !== undefined) {
        const change = Number(quote.change);
        if (!isNaN(change)) {
          holdingChangeAmount = shares * change;
          if (quote.changePercent !== undefined) {
            holdingChangePercent = Number(quote.changePercent);
          }
        }
      }

      // Accumulate daily change amount
      dailyChangeAmount += holdingChangeAmount;

      // Accumulate weighted change percent for portfolio-weighted average
      if (holdingChangePercent !== null && !isNaN(holdingChangePercent) && marketValue > 0) {
        totalWeightedChangePercent += holdingChangePercent * marketValue;
        totalWeight += marketValue;
      }
    }

    // Calculate daily change percentage
    // Prefer portfolio-weighted average if available, otherwise use direct calculation
    let dailyChangePercent = 0;
    if (totalWeight > 0) {
      // Use weighted average (more accurate)
      dailyChangePercent = totalWeightedChangePercent / totalWeight;
    } else if (portfolioValue > 0 && dailyChangeAmount !== 0) {
      // Fallback: calculate from total change amount
      dailyChangePercent = (dailyChangeAmount / portfolioValue) * 100;
    }

    // Calculate YTD
    let ytdPercent: number | null = null;
    if (ytdBaseline !== null && ytdBaseline > 0 && portfolioValue > 0) {
      ytdPercent = ((portfolioValue / ytdBaseline) - 1) * 100;
    }

    // Return normalized values (ensure all are proper numbers, rounded for stability)
    return {
      portfolioValue: Math.round(Number(portfolioValue) * 100) / 100 || 0,
      dailyChangeAmount: Math.round(Number(dailyChangeAmount) * 100) / 100 || 0,
      dailyChangePercent: Math.round(Number(dailyChangePercent) * 10000) / 10000 || 0,
      ytdPercent: ytdPercent !== null ? Math.round(Number(ytdPercent) * 10000) / 10000 : null,
    };
  }, [holdingsKey, quotesKey, ytdBaseline, holdings, quotesData]);
}
