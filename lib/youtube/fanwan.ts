import { FANWAN_CHANNELS, type FanwanChannel } from "./fanwanChannels.js";

export type FanwanVideo = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  url: string;
  durationSec: number | null;
};

const CHANNEL_ID_CACHE = new Map<string, string>();

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function parseISODurationToSeconds(duration: string): number | null {
  const match = /P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(duration);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

async function resolveChannelIdViaHtml(handle: string): Promise<string | null> {
  if (CHANNEL_ID_CACHE.has(handle)) return CHANNEL_ID_CACHE.get(handle)!;
  try {
    const url = `https://www.youtube.com/${handle.replace(/^@/, "@")}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const text = await resp.text();
    const match =
      /"channelId":"(UC[^"]+)"/.exec(text) ||
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[^"]+)"/.exec(text);
    const id = match?.[1] || null;
    if (id) CHANNEL_ID_CACHE.set(handle, id);
    return id;
  } catch {
    return null;
  }
}

async function resolveChannelId(handle: string, apiKey?: string): Promise<string | null> {
  if (CHANNEL_ID_CACHE.has(handle)) return CHANNEL_ID_CACHE.get(handle)!;
  if (apiKey) {
    // Use search to resolve handle to channelId
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "id");
    url.searchParams.set("type", "channel");
    url.searchParams.set("q", handle);
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", apiKey);
    try {
      const resp = await fetch(url.toString());
      if (resp.ok) {
        const json = await resp.json();
        const id = json.items?.[0]?.id?.channelId;
        if (id) {
          CHANNEL_ID_CACHE.set(handle, id);
          return id;
        }
      }
    } catch {
      // ignore and fallback to HTML
    }
  }
  return resolveChannelIdViaHtml(handle);
}

function filterShortsRss(item: { title: string; url: string }) {
  const title = item.title?.toLowerCase() || "";
  const url = item.url?.toLowerCase() || "";
  return !(
    title.includes("#shorts") ||
    title.includes("shorts") ||
    url.includes("/shorts/")
  );
}

export function interleaveVideos(items: FanwanVideo[], limit: number): FanwanVideo[] {
  const groups = new Map<string, FanwanVideo[]>();
  items.forEach((v) => {
    if (!groups.has(v.channelId)) groups.set(v.channelId, []);
    groups.get(v.channelId)!.push(v);
  });
  for (const arr of groups.values()) {
    arr.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }
  const out: FanwanVideo[] = [];
  let last: string | null = null;
  while (out.length < limit) {
    const candidates = Array.from(groups.entries()).filter(([, arr]) => arr.length > 0);
    if (candidates.length === 0) break;
    let pool = candidates;
    if (last && candidates.length > 1) {
      const alt = candidates.filter(([cid]) => cid !== last);
      if (alt.length > 0) pool = alt;
    }
    let pickIdx = 0;
    let pickDate = -Infinity;
    pool.forEach(([cid, arr], idx) => {
      const ts = new Date(arr[0].publishedAt).getTime();
      if (ts > pickDate) {
        pickDate = ts;
        pickIdx = idx;
      }
    });
    const [cid, arr] = pool[pickIdx];
    const video = arr.shift()!;
    out.push(video);
    last = cid;
  }
  return out.slice(0, limit);
}

export function filterByWindow(videos: FanwanVideo[], days: number): FanwanVideo[] {
  const cutoff = new Date(isoDaysAgo(days)).getTime();
  return videos.filter((v) => new Date(v.publishedAt).getTime() >= cutoff);
}

export async function fetchFanwanViaApi(windowDays: number, limit: number, apiKey: string): Promise<FanwanVideo[]> {
  const publishedAfter = isoDaysAgo(windowDays);
  const all: FanwanVideo[] = [];

  for (const ch of FANWAN_CHANNELS) {
    try {
      const channelId = ch.channelId || (await resolveChannelId(ch.handle, apiKey));
      if (!channelId) continue;

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("channelId", channelId);
      searchUrl.searchParams.set("order", "date");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("maxResults", "12");
      searchUrl.searchParams.set("publishedAfter", publishedAfter);
      searchUrl.searchParams.set("key", apiKey);

      const resp = await fetch(searchUrl.toString());
      if (!resp.ok) throw new Error(`search ${resp.status}`);
      const json = await resp.json();
      const ids = (json.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
      if (ids.length === 0) continue;

      const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      videosUrl.searchParams.set("part", "contentDetails,snippet");
      videosUrl.searchParams.set("id", ids.join(","));
      videosUrl.searchParams.set("maxResults", String(ids.length));
      videosUrl.searchParams.set("key", apiKey);
      const vResp = await fetch(videosUrl.toString());
      if (!vResp.ok) throw new Error(`videos ${vResp.status}`);
      const vJson = await vResp.json();
      const cutoff = new Date(publishedAfter).getTime();
      const videos: FanwanVideo[] = (vJson.items || [])
        .map((item: any) => {
          const publishedAt = item.snippet?.publishedAt;
          const duration = item.contentDetails?.duration;
          const durationSec = duration ? parseISODurationToSeconds(duration) : null;
          if (!publishedAt || new Date(publishedAt).getTime() < cutoff) return null;
          if (durationSec !== null && durationSec < 60) return null; // shorts filter
          return {
            videoId: item.id,
            title: item.snippet?.title || "未命名",
            channelId: item.snippet?.channelId || channelId,
            channelTitle: item.snippet?.channelTitle || ch.handle.replace("@", ""),
            publishedAt,
            thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.high?.url || "",
            url: `https://www.youtube.com/watch?v=${item.id}`,
            durationSec,
          } as FanwanVideo;
        })
        .filter(Boolean) as FanwanVideo[];

      all.push(...videos);
    } catch (e) {
      console.warn("[fanwan] api channel fail", ch.handle, (e as Error)?.message);
    }
  }

  all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const windowed = filterByWindow(all, windowDays);
  return interleaveVideos(windowed, limit);
}

function extractTag(entry: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = regex.exec(entry);
  return m ? m[1].trim() : "";
}

function extractAttr(entry: string, tag: string, attr: string) {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"[^>]*>`, "i");
  const m = regex.exec(entry);
  return m ? m[1] : "";
}

function parseRssFeed(xml: string): FanwanVideo[] {
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  const videos: FanwanVideo[] = [];
  for (const entry of entries) {
    const videoId = extractTag(entry, "yt:videoId");
    if (!videoId) continue;
    const title = extractTag(entry, "title") || "未命名";
    const channelId = extractTag(entry, "yt:channelId") || "";
    const channelTitle = extractTag(entry, "name") || "";
    const publishedAt = extractTag(entry, "published") || "";
    const link = extractAttr(entry, "link", "href") || `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    videos.push({
      videoId,
      title,
      channelId,
      channelTitle,
      publishedAt,
      thumbnail,
      url: link,
      durationSec: null,
    });
  }
  return videos;
}

export async function fetchFanwanViaRss(windowDays: number, limit: number): Promise<FanwanVideo[]> {
  const all: FanwanVideo[] = [];
  for (const ch of FANWAN_CHANNELS) {
    try {
      const channelId =
        ch.channelId ||
        CHANNEL_ID_CACHE.get(ch.handle) ||
        (await resolveChannelIdViaHtml(ch.handle));
      if (!channelId) continue;
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      const resp = await fetch(feedUrl);
      if (!resp.ok) throw new Error(`rss ${resp.status}`);
      const xml = await resp.text();
      const vids = parseRssFeed(xml).filter(filterShortsRss);
      all.push(...vids);
      CHANNEL_ID_CACHE.set(ch.handle, channelId);
    } catch (e) {
      console.warn("[fanwan] rss channel fail", ch.handle, (e as Error)?.message);
    }
  }
  all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const windowed = filterByWindow(all, windowDays);
  return interleaveVideos(windowed, limit);
}
