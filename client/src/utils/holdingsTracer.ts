/**
 * Holdings Write Tracer (dev-only)
 * Logs all holdings state changes for debugging
 */

const isDev = import.meta.env.DEV;
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const debugMode = urlParams?.get('debug') === '1' || isDev;

/**
 * Show toast notification (lazy import to avoid circular deps)
 */
async function showDebugToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  try {
    const { toast } = await import('sonner');
    if (type === 'success') {
      toast.success(message, { duration: 3000 });
    } else if (type === 'error') {
      toast.error(message, { duration: 3000 });
    } else {
      toast.info(message, { duration: 2000 });
    }
  } catch (e) {
    // Fallback to console if toast not available
    console.log(`[Toast] ${message}`);
  }
}

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
  
  // Also log to a global array for inspection
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
  
  // Show toast for critical operations (only for imports to avoid spam)
  if (source.includes('importHoldings')) {
    const mode = source.includes('merge') ? '合并' : '替换';
    showDebugToast(`📥 ${mode}: ${holdingsLength} 项`, 'success');
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
  
  // Also log to a global array
  if (!(window as any).__marketValueComputeHistory) {
    (window as any).__marketValueComputeHistory = [];
  }
  
  const prevEntry = (window as any).__marketValueComputeHistory[
    (window as any).__marketValueComputeHistory.length - 1
  ];
  const prevValue = prevEntry?.computedMarketValue ?? 0;
  const valueChanged = Math.abs(computedMarketValue - prevValue) > 0.01;
  
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
  
  // Show toast if market value changed significantly (only if value > 0 and we have quotes)
  // Throttle: only show if value changed by more than $1 and we have valid quotes
  if (valueChanged && computedMarketValue > 0 && holdingsLength > 0 && tickersCount > 0) {
    // Only show if this is a significant change (likely after import)
    const changeAmount = Math.abs(computedMarketValue - prevValue);
    if (changeAmount > 1) {
      showDebugToast(`💰 市值: $${computedMarketValue.toLocaleString()} (${tickersCount}/${holdingsLength})`, 'info');
    }
  }
}
