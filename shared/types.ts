/**
 * Shared Type Definitions
 * Standard response structures for all API endpoints
 */

/**
 * Standard response structure for single-value data (Market prices, etc.)
 */
export interface StandardDataResponse<T> {
  status: "ok" | "stale" | "unavailable";
  value: T;
  asOf: string; // ISO 8601 timestamp
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string; // Only if status === "unavailable"
  // Debug fields (optional, for troubleshooting)
  cache_hit?: boolean;
  fetched_at?: string; // ISO 8601 timestamp
  debug?: {
    data_source: string;
    api_response?: any;
    error?: string;
  };
}

/**
 * Standard response structure for array data (News, Gossip, Deals, etc.)
 */
export interface StandardArrayResponse<T> {
  status: "ok" | "stale" | "unavailable";
  items: T[];
  count: number;
  asOf: string; // ISO 8601 timestamp
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string; // Only if status === "unavailable"
  // Debug fields (optional, for troubleshooting)
  cache_hit?: boolean;
  fetched_at?: string; // ISO 8601 timestamp
  debug?: {
    reason?: string;
    total_fetched?: number;
    filtered_out?: number;
    sample_domains?: string[];
  };
}

/**
 * Market data item with change information
 */
export interface MarketDataItem {
  name: string;
  value: number | string;
  change?: number;
  change_percent?: number;
  unit: string;
  status: "ok" | "stale" | "unavailable";
  asOf: string;
  source: {
    name: string;
    url: string;
  };
  ttlSeconds: number;
  error?: string;
  debug?: {
    data_source: string;
    api_response?: any;
    error?: string;
  };
}

/**
 * Unified Module Payload for community/gossip module
 * Used for consistent data structure across all sources
 */
export interface ModulePayload<T> {
  source: "live" | "cache" | "seed";
  status: "ok" | "degraded" | "failed";
  fetchedAt: string; // ISO 8601 timestamp
  ttlSeconds: number;
  note?: string; // Optional note explaining status/degradation
  items: T[]; // Always >= 3 items (padded if necessary)
}
