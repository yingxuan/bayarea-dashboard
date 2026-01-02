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
 * These are example topics that are always relevant to Bay Area Chinese community
 */
export const GOSSIP_SEED_DATA: GossipSeedItem[] = [
  {
    id: 'seed_1',
    title: '湾区科技公司最新裁员动态',
    url: 'https://www.reddit.com/r/bayarea',
    source: 'reddit',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'seed_2',
    title: 'H1B 和绿卡政策最新变化',
    url: 'https://www.reddit.com/r/cscareerquestions',
    source: 'reddit',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'seed_3',
    title: 'AI 行业薪资和跳槽趋势',
    url: 'https://news.ycombinator.com',
    source: 'hn',
    publishedAt: new Date().toISOString(),
  },
];

/**
 * Get gossip seed data
 * Always returns 3 items
 */
export function getGossipSeedData(): GossipSeedItem[] {
  return GOSSIP_SEED_DATA.slice(0, 3);
}
