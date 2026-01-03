/**
 * Chinese Gossip Seed Data
 * Fallback data for when all API sources fail
 * Ensures we always have 3 items to display
 */

export interface GossipSeedItem {
  id: string;
  title: string;
  url: string;
  source: 'huaren' | 'blind' | 'twitter' | 'reddit' | 'hn';
  publishedAt: string;
}

/**
 * Seed data for Chinese gossip
 * Empty array - do NOT use fake placeholder items
 * If fetch fails, return empty array and let UI handle it
 */
export const GOSSIP_SEED_DATA: GossipSeedItem[] = [];

/**
 * Get gossip seed data
 * Returns empty array - no fake placeholders
 */
export function getGossipSeedData(): GossipSeedItem[] {
  return [];
}
