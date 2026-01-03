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
 * Only huaren.us items as fallback
 */
export const GOSSIP_SEED_DATA: GossipSeedItem[] = [
  {
    id: 'seed_1',
    title: '华人闲话版块最新讨论',
    url: 'https://huaren.us/showforum.html?forumid=398',
    source: 'huaren',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'seed_2',
    title: '湾区华人社区热门话题',
    url: 'https://huaren.us/showforum.html?forumid=398',
    source: 'huaren',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'seed_3',
    title: '查看华人闲话版块',
    url: 'https://huaren.us/showforum.html?forumid=398',
    source: 'huaren',
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
