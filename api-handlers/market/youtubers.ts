/**
 * Vercel Serverless Function: /api/youtubers
 * Fetches latest videos from US stock market YouTube bloggers via RSS
 * 
 * Data Source: YouTube RSS feeds
 * Format: https://www.youtube.com/feeds/videos.xml?channel_id=UC...
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, US_STOCK_YOUTUBERS, SILICON_VALLEY_YOUTUBERS, ytRssUrl, SOURCE_INFO, ttlMsToSeconds } from '../../shared/config.js';
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

const YOUTUBERS_CACHE_TTL = CACHE_TTL.YOUTUBERS;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CHANNEL_ID_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours cache for channel ID extraction

interface YouTuberItem {
  channelName: string;
  title: string;
  url: string;
  publishedAt: string;
  thumbnail: string;
  status: 'ok' | 'unavailable';
}

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

    // Extract title from <title> tag (first occurrence within entry)
    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Extract published date from <published> tag
    const publishedMatch = xml.match(/<published>([^<]+)<\/published>/);
    const publishedAt = publishedMatch ? publishedMatch[1] : new Date().toISOString();

    // Extract URL from <link> tag (rel="alternate")
    const linkMatch = xml.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || 
                      xml.match(/<link[^>]*href="([^"]+)"/);
    const url = linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoId}`;

    return { videoId, title, publishedAt, url };
  } catch (error) {
    console.error('[YouTubers] RSS parsing error:', error);
    return null;
  }
}

/**
 * Extract channel ID from YouTube @handle URL by fetching channel page
 * Caches the result to avoid repeated fetches
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
      console.warn(`[YouTubers] Failed to fetch channel page for ${url}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Extract channel ID from page HTML
    // Pattern: "channelId":"UC..."
    const channelIdMatch = html.match(/"channelId"\s*:\s*"([^"]+)"/);
    if (channelIdMatch) {
      const channelId = channelIdMatch[1];
      // Cache the result
      cache.set(cacheKey, { data: channelId, timestamp: now });
      return channelId;
    }
    
    // Alternative pattern: <link rel="canonical" href="https://www.youtube.com/channel/UC...">
    const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="https:\/\/www\.youtube\.com\/channel\/([^"\/]+)"/);
    if (canonicalMatch) {
      const channelId = canonicalMatch[1];
      cache.set(cacheKey, { data: channelId, timestamp: now });
      return channelId;
    }
    
    console.warn(`[YouTubers] Could not extract channel ID from ${url}`);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[YouTubers] Error extracting channel ID from ${url}:`, errorMsg);
    return null;
  }
}

/**
 * Get channel ID (from config or extract from URL/handle)
 */
async function getChannelId(channel: { channelId?: string; url?: string; handle?: string }): Promise<string | null> {
  // If channelId is already in config, try it first
  if (channel.channelId && channel.channelId.trim() !== '') {
    // Verify the channelId works by trying to fetch RSS
    const testUrl = ytRssUrl(channel.channelId);
    try {
      const testResponse = await fetch(testUrl, {
        headers: { 'User-Agent': 'BayAreaDashboard/1.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (testResponse.ok) {
        return channel.channelId; // ChannelId is valid
      }
      // If 404, fall through to extract from URL/handle
      console.warn(`[YouTubers] ChannelId ${channel.channelId} returned ${testResponse.status}, will try to extract from URL/handle`);
    } catch (error) {
      // If fetch fails, fall through to extract from URL/handle
      console.warn(`[YouTubers] Failed to verify channelId ${channel.channelId}, will try to extract from URL/handle`);
    }
  }
  
  // Try to extract from URL
  if (channel.url) {
    const extractedId = await extractChannelIdFromUrl(channel.url);
    if (extractedId) {
      return extractedId;
    }
  }
  
  // Try to extract from handle (build URL from handle)
  if (channel.handle) {
    // Handle format: @TheValley101 -> https://www.youtube.com/@TheValley101
    const handleUrl = channel.handle.startsWith('@') 
      ? `https://www.youtube.com/${channel.handle}`
      : `https://www.youtube.com/@${channel.handle}`;
    const extractedId = await extractChannelIdFromUrl(handleUrl);
    if (extractedId) {
      return extractedId;
    }
  }
  
  return null;
}

/**
 * Fetch latest video from a YouTube channel RSS feed
 */
async function fetchChannelLatestVideo(channelId: string, channelName: string): Promise<YouTuberItem | null> {
  const rssUrl = ytRssUrl(channelId);
  
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'BayAreaDashboard/1.0',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.warn(`[YouTubers] Failed to fetch RSS for ${channelName}: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    
    // Find first <entry> tag (latest video)
    const entryMatch = xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/);
    if (!entryMatch) {
      console.warn(`[YouTubers] No entry found in RSS for ${channelName}`);
      return null;
    }

    const entryXml = entryMatch[1];
    const videoData = parseYouTubeRSS(entryXml);
    
    if (!videoData) {
      console.warn(`[YouTubers] Failed to parse RSS for ${channelName}`);
      return null;
    }

    // Check if video is within 7 days
    const publishedDate = new Date(videoData.publishedAt);
    const now = new Date();
    const ageMs = now.getTime() - publishedDate.getTime();

    if (ageMs > SEVEN_DAYS_MS) {
      console.log(`[YouTubers] Video from ${channelName} is ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days old, skipping`);
      return null;
    }

    return {
      channelName,
      title: videoData.title,
      url: videoData.url,
      publishedAt: videoData.publishedAt,
      thumbnail: `https://i.ytimg.com/vi/${videoData.videoId}/hqdefault.jpg`,
      status: 'ok' as const,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[YouTubers] Error fetching ${channelName}:`, errorMsg);
    return null;
  }
}

/**
 * Fetch videos from channels with concurrency control
 */
async function fetchChannels(channels: Array<{ name: string; channelId?: string; url?: string; handle?: string }>): Promise<YouTuberItem[]> {
  const results: YouTuberItem[] = [];
  
  // First, get all channel IDs (extract if needed)
  const channelIds = await Promise.all(
    channels.map(async (channel) => {
      const channelId = await getChannelId(channel);
      return { channel, channelId };
    })
  );
  
  // Fetch all channels concurrently (with Promise.all)
  const fetchPromises = channelIds.map(({ channel, channelId }) => {
    if (!channelId) {
      return Promise.resolve(null); // Channel ID extraction failed
    }
    return fetchChannelLatestVideo(channelId, channel.name);
  });

  const channelResults = await Promise.all(fetchPromises);

  // Process results: add successful videos or unavailable status
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const video = channelResults[i];

    if (video) {
      results.push(video);
    } else {
      // Channel unavailable (fetch failed, no channel ID, or no recent video)
      results.push({
        channelName: channel.name,
        title: '',
        url: '',
        publishedAt: '',
        thumbnail: '',
        status: 'unavailable' as const,
      });
    }
  }

  // Sort by publishedAt (most recent first), unavailable items at the end
  results.sort((a, b) => {
    if (a.status === 'unavailable' && b.status !== 'unavailable') return 1;
    if (a.status !== 'unavailable' && b.status === 'unavailable') return -1;
    if (a.status === 'unavailable' && b.status === 'unavailable') return 0;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return results;
}

export async function handleYoutubers(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (handleOptions(req, res)) {
    return;
  }

  try {
    const nocache = isCacheBypass(req);
    
    // Determine which channels to fetch based on query parameter
    const category = req.query.category as string || 'stock'; // 'stock' or 'tech'
    const cacheKey = `youtubers_${category}`;
    const channels = category === 'tech' ? [...SILICON_VALLEY_YOUTUBERS] : [...US_STOCK_YOUTUBERS];
    
    // Check cache
    const cached = getCachedData(cacheKey, YOUTUBERS_CACHE_TTL, nocache);
    if (cached) {
      const cachedData = cached.data;
      normalizeCachedResponse(cachedData, SOURCE_INFO.YOUTUBE_RSS, ttlMsToSeconds(YOUTUBERS_CACHE_TTL), 'items');
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
      console.log(`[API /api/youtubers] Cache bypass requested via ?nocache=1 (category: ${category})`);
    }
    
    // Fetch fresh data
    const youtubers = await fetchChannels(channels);
    const fetchedAt = new Date();
    const fetchedAtISO = fetchedAt.toISOString();
    const ttlSeconds = ttlMsToSeconds(YOUTUBERS_CACHE_TTL);

    // Determine status
    const availableCount = youtubers.filter(item => item.status === 'ok').length;
    const status: "ok" | "stale" | "unavailable" = availableCount > 0 ? "ok" : "unavailable";

    const response: any = {
      // Standard response structure
      status,
      items: youtubers,
      count: youtubers.length,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.YOUTUBE_RSS,
      ttlSeconds,
      cache_hit: false,
      fetched_at: fetchedAtISO,
      // Legacy fields for backward compatibility
      youtubers,
      updated_at: formatUpdatedAt(),
      cache_mode: nocache ? 'bypass' : 'normal',
      cache_age_seconds: 0,
      cache_expires_in_seconds: ttlSeconds,
      age: 0,
      expiry: ttlSeconds,
    };

    // Update cache
    setCache(cacheKey, response);

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/youtubers] Error:', error);
    
    // Try to return stale cache on error
    const staleCache = getStaleCache('youtubers');
    if (staleCache) {
      const staleData = staleCache.data;
      normalizeStaleResponse(staleData, SOURCE_INFO.YOUTUBE_RSS, ttlMsToSeconds(YOUTUBERS_CACHE_TTL), 'items');
      return res.status(200).json({
        ...staleData,
        cache_hit: false,
        cache_mode: 'stale',
      });
    }

    // No cache available, return error response
    const fetchedAtISO = new Date().toISOString();
    res.status(200).json({
      status: 'unavailable' as const,
      items: [],
      count: 0,
      asOf: fetchedAtISO,
      source: SOURCE_INFO.YOUTUBE_RSS,
      ttlSeconds: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      cache_hit: false,
      fetched_at: fetchedAtISO,
    });
  }
}

export default handleYoutubers;
