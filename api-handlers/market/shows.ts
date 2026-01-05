/**
 * Vercel Serverless Function: /api/shows
 * Fetches latest videos from Chinese video platforms (腾讯视频/优酷/芒果TV) via YouTube
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, SOURCE_INFO, ttlMsToSeconds, ytRssUrl } from '../../shared/config.js';
import {
  cache,
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
  normalizeCachedResponse,
  normalizeStaleResponse,
  formatUpdatedAt,
} from '../../api/utils.js';

const SHOWS_CACHE_TTL = CACHE_TTL.SHOWS;
const CHANNEL_ID_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours cache for channel ID extraction

interface Show {
  id: string;
  title: string;
  description: string;
  rating: number;
  poster_url: string;
  url: string;
  platform: string; // 腾讯视频 / 优酷 / 芒果TV
  publishedAt: string;
}

// Chinese video platform YouTube channels
const TV_CHANNELS = [
  {
    name: '腾讯视频',
    url: 'https://www.youtube.com/@TencentVideo/streams',
    handle: '@TencentVideo',
  },
  {
    name: '优酷',
    url: 'https://www.youtube.com/@youku-official/streams',
    handle: '@youku-official',
  },
  {
    name: '芒果TV',
    url: 'https://www.youtube.com/@MangoTV-Official/streams',
    handle: '@MangoTV-Official',
  },
  {
    name: 'CCTVDrama',
    url: 'https://www.youtube.com/@CCTVDrama/streams',
    handle: '@CCTVDrama',
  },
];

/**
 * Parse YouTube RSS XML and extract video information
 */
function parseYouTubeRSS(xml: string): { videoId: string; title: string; publishedAt: string; url: string } | null {
  try {
    // Extract video ID from <yt:videoId> tag (within <entry>)
    const videoIdMatch = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!videoIdMatch) {
      // Fallback: try to extract from <id> tag (format: yt:video:VIDEO_ID)
      const idMatch = xml.match(/<id[^>]*>yt:video:([^<]+)<\/id>/);
      if (!idMatch) return null;
      const videoId = idMatch[1];
      
      // Extract title
      const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

      // Extract published date
      const publishedMatch = xml.match(/<published>([^<]+)<\/published>/);
      const publishedAt = publishedMatch ? publishedMatch[1] : new Date().toISOString();

      // Extract URL from <link> tag
      const linkMatch = xml.match(/<link[^>]*href="([^"]+)"/);
      const url = linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoId}`;

      return { videoId, title, publishedAt, url };
    }
    
    const videoId = videoIdMatch[1];

    // Extract title from <title> tag
    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Extract published date
    const publishedMatch = xml.match(/<published>([^<]+)<\/published>/);
    const publishedAt = publishedMatch ? publishedMatch[1] : new Date().toISOString();

    // Extract URL from <link> tag
    const linkMatch = xml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || 
                      xml.match(/<link[^>]*href="([^"]+)"/);
    const url = linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoId}`;

    return { videoId, title, publishedAt, url };
  } catch (error) {
    console.error('[Shows] RSS parsing error:', error);
    return null;
  }
}

/**
 * Extract channel ID from YouTube @handle URL
 */
async function extractChannelIdFromUrl(url: string): Promise<string | null> {
  const cacheKey = `channel_id_${url}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  
  // Check cache (24 hour TTL)
  if (cached && now - cached.timestamp < CHANNEL_ID_CACHE_TTL_MS) {
    return cached.data;
  }
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      console.warn(`[Shows] Failed to fetch channel page for ${url}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Extract channel ID from page HTML
    const channelIdMatch = html.match(/"channelId"\s*:\s*"([^"]+)"/);
    if (channelIdMatch) {
      const channelId = channelIdMatch[1];
      cache.set(cacheKey, { data: channelId, timestamp: now });
      return channelId;
    }
    
    // Alternative pattern
    const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="https:\/\/www\.youtube\.com\/channel\/([^"\/]+)"/);
    if (canonicalMatch) {
      const channelId = canonicalMatch[1];
      cache.set(cacheKey, { data: channelId, timestamp: now });
      return channelId;
    }
    
    console.warn(`[Shows] Could not extract channel ID from ${url}`);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Shows] Error extracting channel ID from ${url}:`, errorMsg);
    return null;
  }
}

/**
 * Parse multiple videos from YouTube RSS XML
 */
function parseAllYouTubeRSS(xml: string): Array<{ videoId: string; title: string; publishedAt: string; url: string }> {
  const videos: Array<{ videoId: string; title: string; publishedAt: string; url: string }> = [];
  
  // Find all <entry> tags using a while loop instead of matchAll for compatibility
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let entryMatch: RegExpExecArray | null;
  
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entryXml = entryMatch[1];
    const videoData = parseYouTubeRSS(entryXml);
    if (videoData) {
      videos.push(videoData);
    }
  }
  
  return videos;
}

/**
 * Fetch multiple latest videos from a YouTube channel RSS feed
 */
async function fetchChannelVideos(channelId: string, channelName: string, maxVideos?: number): Promise<Show[]> {
  const rssUrl = ytRssUrl(channelId);
  const shows: Show[] = [];
  
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'BayAreaDashboard/1.0',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[Shows] Failed to fetch RSS for ${channelName}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    
    // Parse all videos from RSS
    const videos = parseAllYouTubeRSS(xml);
    
    if (videos.length === 0) {
      console.warn(`[Shows] No videos found in RSS for ${channelName}`);
      return [];
    }

    // Take all videos (or up to maxVideos if specified) and convert to Show format
    const videosToProcess = maxVideos ? videos.slice(0, maxVideos) : videos;
    for (const videoData of videosToProcess) {
      shows.push({
        id: videoData.videoId,
        title: videoData.title,
        description: '',
        rating: 0,
        poster_url: `https://i.ytimg.com/vi/${videoData.videoId}/hqdefault.jpg`,
        url: videoData.url,
        platform: channelName,
        publishedAt: videoData.publishedAt,
      });
    }

    console.log(`[Shows] ✅ Fetched ${shows.length} videos from ${channelName} (RSS had ${videos.length} total videos)`);
    return shows;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Shows] Error fetching ${channelName}:`, errorMsg);
    return [];
  }
}

/**
 * Fetch shows from all channels
 * Ensures first 4 videos are from 4 different sources
 */
async function fetchAllShows(): Promise<Show[]> {
  const allShows: Show[] = [];
  const channelShowsMap: Map<string, Show[]> = new Map();
  
  // Fetch from all channels concurrently
  // Each channel returns multiple videos (up to 5 per channel)
  const fetchPromises = TV_CHANNELS.map(async (channel) => {
    // Extract channel ID from URL
    const channelId = await extractChannelIdFromUrl(channel.url);
    if (!channelId) {
      console.warn(`[Shows] Could not extract channel ID for ${channel.name}`);
      return { channelName: channel.name, shows: [] };
    }
    
    // Fetch multiple videos from this channel (no limit)
    const shows = await fetchChannelVideos(channelId, channel.name, 50); // Increased to 50 per channel
    return { channelName: channel.name, shows };
  });
  
  const results = await Promise.all(fetchPromises);
  
  // Store shows by channel name
  for (const result of results) {
    channelShowsMap.set(result.channelName, result.shows);
  }
  
  // Ensure first 4 videos are from 4 different sources
  const firstFourShows: Show[] = [];
  const usedChannels = new Set<string>();
  
  // Get one video from each channel for the first 4
  for (const channel of TV_CHANNELS) {
    if (usedChannels.size >= 4) break;
    
    const channelShows = channelShowsMap.get(channel.name) || [];
    if (channelShows.length > 0 && !usedChannels.has(channel.name)) {
      // Get the latest video from this channel (already sorted by date)
      firstFourShows.push(channelShows[0]);
      usedChannels.add(channel.name);
    }
  }
  
  // Sort first 4 by published date (newest first)
  firstFourShows.sort((a: Show, b: Show) => {
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  
  // Add remaining videos from all channels (excluding the ones already used in first 4)
  const remainingShows: Show[] = [];
  channelShowsMap.forEach((shows, channelName) => {
    if (usedChannels.has(channelName)) {
      // Skip the first video (already in firstFourShows), add the rest
      remainingShows.push(...shows.slice(1));
    } else {
      // Add all videos from channels not in first 4
      remainingShows.push(...shows);
    }
  });
  
  // Sort remaining videos by published date (newest first)
  remainingShows.sort((a: Show, b: Show) => {
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  
  // Combine: first 4 (one from each source) + remaining videos
  allShows.push(...firstFourShows, ...remainingShows);
  
  console.log(`[Shows] ✅ Fetched ${allShows.length} total videos from ${TV_CHANNELS.length} channels`);
  console.log(`[Shows] First 4 videos from sources: ${firstFourShows.map(s => s.platform).join(', ')}`);
  return allShows;
}

export async function handleShows(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    const cacheKey = 'shows';
    
    // Check cache
    const cached = getCachedData(cacheKey, SHOWS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.YOUTUBE_RSS, ttlMsToSeconds(SHOWS_CACHE_TTL), 'shows');
      return res.status(200).json({
        ...cachedData,
        cache_hit: true,
        cache_mode: 'normal',
        cache_age_seconds: cached.cacheAgeSeconds,
        cache_expires_in_seconds: cached.cacheExpiresInSeconds,
      });
    }

    // Log cache bypass
    if (nocache) {
      console.log('[API /api/shows] Cache bypass requested via ?nocache=1');
    }

    // Fetch fresh data from YouTube channels
    const shows = await fetchAllShows();
    const fetchedAtISO = new Date().toISOString();
    const ttlSeconds = ttlMsToSeconds(SHOWS_CACHE_TTL);
    
    const response: any = {
      // Standard response structure
      status: shows.length > 0 ? ('ok' as const) : ('unavailable' as const),
      items: shows, // All videos, no limit
      count: shows.length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.YOUTUBE_RSS,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      shows: shows, // All videos, no limit
      updated_at: formatUpdatedAt(),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      age: 0,
      expiry: ttlSeconds,
    };

    // Update cache
    if (shows.length > 0) {
      setCache(cacheKey, response);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/shows] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'shows';
    const stale = getStaleCache(cacheKey);
    
    if (stale) {
      const staleData = stale.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.YOUTUBE_RSS, ttlMsToSeconds(SHOWS_CACHE_TTL), 'shows');
      return res.status(200).json({
        ...staleData,
        cache_hit: true,
        stale: true,
      });
    }

    // If TMDB_API_KEY is missing, return empty array with helpful message
    if (error instanceof Error && error.message.includes('TMDB_API_KEY')) {
      const errorAtISO = new Date().toISOString();
      return res.status(200).json({
        status: 'unavailable' as const,
        items: [],
        count: 0,
        asOf: errorAtISO,
        source: SOURCE_INFO.YOUTUBE_RSS,
        ttlSeconds: 0,
        error: 'Failed to fetch shows',
        message: 'Unable to fetch videos from YouTube channels.',
        cache_hit: false,
        fetched_at: errorAtISO,
        // Legacy fields
        shows: [],
        updated_at: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      });
    }

    const errorAtISO = new Date().toISOString();
    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: errorAtISO,
      source: SOURCE_INFO.YOUTUBE_RSS,
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: errorAtISO,
      // Legacy fields
      shows: [],
      updated_at: formatUpdatedAt(),
    });
  }
}

export default handleShows;
