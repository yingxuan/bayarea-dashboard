/**
 * Debug Panel Component
 * Shows holdings write and market value compute traces on mobile
 * Only visible in dev mode or with ?debug=1
 */

import { useEffect, useState } from "react";

const isDev = import.meta.env.DEV;
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const debugMode = urlParams?.get('debug') === '1' || isDev;

interface TraceEntry {
  timestamp: string;
  source: string;
  holdingsLength: number;
  first3Tickers: string[];
  hash: string;
}

interface MarketValueEntry {
  timestamp: string;
  holdingsLength: number;
  computedMarketValue: number;
  tickersCount: number;
}

export default function DebugPanel() {
  const [holdingsHistory, setHoldingsHistory] = useState<TraceEntry[]>([]);
  const [marketValueHistory, setMarketValueHistory] = useState<MarketValueEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!debugMode || typeof window === 'undefined') return;

    const updateHistory = () => {
      const holdings = (window as any).__holdingsWriteHistory || [];
      const marketValue = (window as any).__marketValueComputeHistory || [];
      setHoldingsHistory(holdings.slice(-5)); // Last 5 entries
      setMarketValueHistory(marketValue.slice(-5)); // Last 5 entries
    };

    // Update every 500ms
    const interval = setInterval(updateHistory, 500);
    updateHistory(); // Initial update

    return () => clearInterval(interval);
  }, []);

  if (!debugMode) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="w-full px-3 py-2 text-xs font-mono bg-muted hover:bg-muted/80 text-foreground text-left flex items-center justify-between"
      >
        <span>🔍 Debug Panel ({holdingsHistory.length} writes, {marketValueHistory.length} computes)</span>
        <span>{isVisible ? '▼' : '▲'}</span>
      </button>
      
      {isVisible && (
        <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3 text-xs font-mono">
          {/* Holdings Writes */}
          <div>
            <div className="font-semibold mb-1 text-foreground/80">Holdings Writes (last 5):</div>
            {holdingsHistory.length === 0 ? (
              <div className="text-muted-foreground">No writes yet</div>
            ) : (
              <div className="space-y-1">
                {holdingsHistory.map((entry, idx) => (
                  <div key={idx} className="bg-muted/50 p-2 rounded text-[10px]">
                    <div className="font-semibold">{entry.source}</div>
                    <div>Length: {entry.holdingsLength}</div>
                    <div>Tickers: {entry.first3Tickers.join(', ')}</div>
                    <div className="text-muted-foreground truncate">Hash: {entry.hash}</div>
                    <div className="text-muted-foreground text-[9px]">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Market Value Computes */}
          <div>
            <div className="font-semibold mb-1 text-foreground/80">Market Value (last 5):</div>
            {marketValueHistory.length === 0 ? (
              <div className="text-muted-foreground">No computes yet</div>
            ) : (
              <div className="space-y-1">
                {marketValueHistory.map((entry, idx) => (
                  <div key={idx} className="bg-muted/50 p-2 rounded text-[10px]">
                    <div className="font-semibold">${entry.computedMarketValue.toLocaleString()}</div>
                    <div>Holdings: {entry.holdingsLength}, Quotes: {entry.tickersCount}</div>
                    <div className="text-muted-foreground text-[9px]">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
