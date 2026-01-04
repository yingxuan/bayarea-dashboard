/**
 * Holdings Write Tracer (dev-only)
 * Logs all holdings state changes for debugging
 * Only logs to console - no UI elements
 */

const isDev = import.meta.env.DEV;
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const debugMode = urlParams?.get('debug') === '1' || isDev;

/**
 * Trace holdings write operation
 */
export function traceHoldingsWrite(source: string, holdings: any[]): void {
  if (!debugMode || typeof window === 'undefined') return;
  
  const timestamp = new Date().toISOString();
  const holdingsLength = holdings.length;
  const first3Tickers = holdings.slice(0, 3).map(h => h.ticker || 'N/A');
  const holdingsJson = JSON.stringify(holdings);
  const hash = holdingsJson.substring(0, 50).replace(/\s/g, '');
  
  console.log(`[HoldingsTracer] WRITE @ ${timestamp}`, {
    source,
    holdingsLength,
    first3Tickers,
    hash,
    fullHash: holdingsJson.length > 0 ? `${holdingsJson.length} chars` : 'empty',
  });
  
  // Also log to a global array for inspection (console only)
  if (!(window as any).__holdingsWriteHistory) {
    (window as any).__holdingsWriteHistory = [];
  }
  (window as any).__holdingsWriteHistory.push({
    timestamp,
    source,
    holdingsLength,
    first3Tickers,
    hash,
    holdings: holdings.slice(), // Copy for inspection
  });
  
  // Keep only last 20 entries
  const history = (window as any).__holdingsWriteHistory;
  if (history.length > 20) {
    history.shift();
  }
}

/**
 * Trace market value computation
 */
export function traceMarketValueCompute(
  holdingsLength: number,
  computedMarketValue: number,
  tickersCount: number,
  lastPriceFetchTime?: string
): void {
  if (!debugMode || typeof window === 'undefined') return;
  
  const timestamp = new Date().toISOString();
  
  console.log(`[MarketValueTracer] COMPUTE @ ${timestamp}`, {
    holdingsLength,
    computedMarketValue,
    tickersCount,
    lastPriceFetchTime: lastPriceFetchTime || 'N/A',
  });
  
  // Also log to a global array (console only)
  if (!(window as any).__marketValueComputeHistory) {
    (window as any).__marketValueComputeHistory = [];
  }
  
  (window as any).__marketValueComputeHistory.push({
    timestamp,
    holdingsLength,
    computedMarketValue,
    tickersCount,
    lastPriceFetchTime,
  });
  
  // Keep only last 20 entries
  const history = (window as any).__marketValueComputeHistory;
  if (history.length > 20) {
    history.shift();
  }
}
