/**
 * Debug Panel Component
 * Shows holdings write and market value compute traces on mobile
 * Also shows Places cache status and manual refresh button
 * Only visible in dev mode or with ?debug=1
 */

import { useEffect, useState } from "react";
import { refreshSouthBayPlaces, getCacheStatus, clearNewPlacesCache } from "@/hooks/usePlacesCache";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SeedCategory, SeedPlace } from "@shared/types/seeds";

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
  const [placesCacheStatus, setPlacesCacheStatus] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSeedBuilder, setShowSeedBuilder] = useState(false);
  const [seedBuilderText, setSeedBuilderText] = useState('');
  const [seedBuilderCategory, setSeedBuilderCategory] = useState<SeedCategory>('奶茶');

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

    // Load Places cache status
    const loadCacheStatus = async () => {
      try {
        const status = await getCacheStatus();
        setPlacesCacheStatus(status);
      } catch (error) {
        console.error('[DebugPanel] Error loading cache status:', error);
      }
    };
    loadCacheStatus();
    const cacheStatusInterval = setInterval(loadCacheStatus, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(cacheStatusInterval);
    };
  }, []);

  const handleRefreshPlaces = async () => {
    setRefreshing(true);
    try {
      const result = await refreshSouthBayPlaces();
      if (result.success) {
        console.log('[DebugPanel] Places refreshed:', result);
        // Reload cache status
        const status = await getCacheStatus();
        setPlacesCacheStatus(status);
        // Reload page to show new data
        window.location.reload();
      } else {
        alert(`Refresh failed: ${result.error}`);
      }
    } catch (error: any) {
      console.error('[DebugPanel] Error refreshing places:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const generateSearchUrl = (name: string, city: string): string => {
    const query = `${name} ${city} CA`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };

  const parseSeedList = (text: string): SeedPlace[] => {
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    const seeds: SeedPlace[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try CSV format first: name,city,tags
      if (trimmed.includes(',')) {
        const parts = trimmed.split(',').map((p) => p.trim());
        if (parts.length >= 2) {
          const [name, city, ...tagParts] = parts;
          const tags = tagParts.length > 0 ? tagParts : undefined;
          const query = `${name} ${city} CA`;
          seeds.push({
            name,
            city,
            mapsUrl: generateSearchUrl(name, city),
            mapsType: 'search',
            query,
            categoryTags: tags,
          });
          continue;
        }
      }

      // Try pipe format: name | city | tags
      if (trimmed.includes('|')) {
        const parts = trimmed.split('|').map((p) => p.trim());
        if (parts.length >= 2) {
          const [name, city, ...tagParts] = parts;
          const tags = tagParts.length > 0 ? tagParts : undefined;
          const query = `${name} ${city} CA`;
          seeds.push({
            name,
            city,
            mapsUrl: generateSearchUrl(name, city),
            mapsType: 'search',
            query,
            categoryTags: tags,
          });
          continue;
        }
      }

      // Single line: assume "name city" format
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const city = parts[parts.length - 1];
        const name = parts.slice(0, -1).join(' ');
        const query = `${name} ${city} CA`;
        seeds.push({
          name,
          city,
          mapsUrl: generateSearchUrl(name, city),
          mapsType: 'search',
          query,
        });
      }
    }

    return seeds;
  };

  const handleGenerateSeeds = () => {
    if (!seedBuilderText.trim()) {
      alert('Please paste a list of places');
      return;
    }

    const seeds = parseSeedList(seedBuilderText);
    if (seeds.length === 0) {
      alert('No valid seeds generated. Format: "name, city" or "name | city"');
      return;
    }

    // Create seed file
    const seedFile = {
      version: 1,
      category: seedBuilderCategory,
      region: 'southbay',
      updatedAt: new Date().toISOString(),
      items: seeds,
    };

    // Download as JSON
    const blob = new Blob([JSON.stringify(seedFile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${seedBuilderCategory}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Also store in localStorage for preview
    const key = `seed_preview_${seedBuilderCategory}`;
    localStorage.setItem(key, JSON.stringify(seedFile));

    alert(`Generated ${seeds.length} seeds! JSON downloaded.`);
    setSeedBuilderText('');
  };

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

          {/* Places Cache Status */}
          <div>
            <div className="font-semibold mb-1 text-foreground/80">Places Cache (South Bay):</div>
            {placesCacheStatus ? (
              <div className="space-y-2">
                <div className="bg-muted/50 p-2 rounded text-[10px]">
                  <div>Restaurant: {placesCacheStatus.restaurantPool?.itemCount || 0} items</div>
                  <div className="text-muted-foreground">
                    Age: {placesCacheStatus.restaurantPool?.cacheAgeDays ?? 'N/A'} days
                  </div>
                  <div className="text-muted-foreground text-[9px]">
                    Updated: {placesCacheStatus.restaurantPool 
                      ? new Date(placesCacheStatus.restaurantPool.updatedAt).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
                <div className="bg-muted/50 p-2 rounded text-[10px]">
                  <div>Cafe: {placesCacheStatus.cafePool?.itemCount || 0} items</div>
                  <div className="text-muted-foreground">
                    Age: {placesCacheStatus.cafePool?.cacheAgeDays ?? 'N/A'} days
                  </div>
                  <div className="text-muted-foreground text-[9px]">
                    Updated: {placesCacheStatus.cafePool
                      ? new Date(placesCacheStatus.cafePool.updatedAt).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
                <div className="bg-muted/50 p-2 rounded text-[10px]">
                  <div>新店打卡: {placesCacheStatus.newPlacesPool?.itemCount || 0} items</div>
                  <div className="text-muted-foreground">
                    Age: {placesCacheStatus.newPlacesPool?.cacheAgeDays ?? 'N/A'} days
                  </div>
                  <div className="text-muted-foreground text-[9px]">
                    Updated: {placesCacheStatus.newPlacesPool
                      ? new Date(placesCacheStatus.newPlacesPool.updatedAt).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
                {placesCacheStatus.inCooldown && (
                  <div className="bg-destructive/20 p-2 rounded text-[10px] text-destructive">
                    Cooldown active until: {placesCacheStatus.cooldownUntil
                      ? new Date(placesCacheStatus.cooldownUntil).toLocaleString()
                      : 'Unknown'}
                  </div>
                )}
                <div className="space-y-1">
                  <Button
                    onClick={handleRefreshPlaces}
                    disabled={refreshing || placesCacheStatus.inCooldown}
                    className="w-full text-xs py-1 h-auto"
                    size="sm"
                  >
                    {refreshing ? '刷新中...' : '刷新 South Bay 店铺缓存'}
                  </Button>
                  <Button
                    onClick={async () => {
                      await clearNewPlacesCache();
                      const status = await getCacheStatus();
                      setPlacesCacheStatus(status);
                      window.location.reload();
                    }}
                    className="w-full text-xs py-1 h-auto"
                    size="sm"
                    variant="outline"
                  >
                    清除新店打卡缓存
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">Loading...</div>
            )}
          </div>

          {/* Seed Builder */}
          <div>
            <div className="font-semibold mb-1 text-foreground/80 flex items-center justify-between">
              <span>Seed Builder</span>
              <Button
                onClick={() => setShowSeedBuilder(!showSeedBuilder)}
                variant="ghost"
                size="sm"
                className="h-auto py-0.5 px-2 text-[10px]"
              >
                {showSeedBuilder ? 'Hide' : 'Show'}
              </Button>
            </div>
            {showSeedBuilder && (
              <div className="space-y-2 bg-muted/30 p-2 rounded">
                <Select value={seedBuilderCategory} onValueChange={(v) => setSeedBuilderCategory(v as SeedCategory)}>
                  <SelectTrigger className="h-7 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="奶茶">奶茶</SelectItem>
                    <SelectItem value="中餐">中餐</SelectItem>
                    <SelectItem value="夜宵">夜宵</SelectItem>
                    <SelectItem value="新店打卡">新店打卡</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={seedBuilderText}
                  onChange={(e) => setSeedBuilderText(e.target.value)}
                  placeholder="Paste list (one per line):&#10;name, city&#10;or: name | city&#10;or: name city"
                  className="h-20 text-[10px] font-mono"
                />
                <Button
                  onClick={handleGenerateSeeds}
                  className="w-full text-xs py-1 h-auto"
                  size="sm"
                >
                  Generate & Download JSON
                </Button>
                <div className="text-[9px] text-muted-foreground">
                  Format: CSV (name,city) or pipe (name | city) or space (name city)
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
