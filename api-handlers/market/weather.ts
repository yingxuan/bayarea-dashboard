/**
 * Weather handler: /api/weather
 * Fetches current Bay Area weather from Open-Meteo (free, no auth)
 * Returns SF weather + 今日 rain probability
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ttlMsToSeconds } from '../../shared/config.js';
import {
  setCorsHeaders,
  handleOptions,
  isCacheBypass,
  getCachedData,
  setCache,
  getStaleCache,
} from '../../lib/api-utils.js';

const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT = 8000;

// WMO weather codes → Chinese description + emoji
const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: '晴', emoji: '☀️' },
  1: { label: '大致晴朗', emoji: '🌤️' },
  2: { label: '局部多云', emoji: '⛅' },
  3: { label: '阴', emoji: '☁️' },
  45: { label: '有雾', emoji: '🌫️' },
  48: { label: '冻雾', emoji: '🌫️' },
  51: { label: '小毛毛雨', emoji: '🌦️' },
  53: { label: '中毛毛雨', emoji: '🌦️' },
  55: { label: '大毛毛雨', emoji: '🌧️' },
  61: { label: '小雨', emoji: '🌧️' },
  63: { label: '中雨', emoji: '🌧️' },
  65: { label: '大雨', emoji: '🌧️' },
  71: { label: '小雪', emoji: '🌨️' },
  73: { label: '中雪', emoji: '❄️' },
  75: { label: '大雪', emoji: '❄️' },
  80: { label: '阵雨', emoji: '🌦️' },
  81: { label: '中阵雨', emoji: '🌧️' },
  82: { label: '强阵雨', emoji: '⛈️' },
  95: { label: '雷阵雨', emoji: '⛈️' },
  96: { label: '雷阵雨夹冰雹', emoji: '⛈️' },
  99: { label: '强雷阵雨夹冰雹', emoji: '⛈️' },
};

function getWeatherDesc(code: number): { label: string; emoji: string } {
  return WMO_CODES[code] || { label: '未知', emoji: '🌡️' };
}

export async function handleWeather(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (handleOptions(req, res)) return;

  const cacheKey = 'weather-bayarea';

  if (!isCacheBypass(req)) {
    const cached = getCachedData(cacheKey, WEATHER_CACHE_TTL, false);
    if (cached?.data) {
      return res.status(200).json({ ...cached.data, cache_hit: true });
    }
  }

  try {
    const url = [
      'https://api.open-meteo.com/v1/forecast',
      '?latitude=37.7749&longitude=-122.4194',
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
      '&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min',
      '&temperature_unit=fahrenheit&wind_speed_unit=mph',
      '&timezone=America/Los_Angeles&forecast_days=1',
    ].join('');

    const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!resp.ok) throw new Error(`Open-Meteo returned ${resp.status}`);

    const data = await resp.json();
    const cur = data.current;
    const daily = data.daily;

    const weatherCode = cur.weather_code ?? 0;
    const { label, emoji } = getWeatherDesc(weatherCode);

    const payload = {
      status: 'ok' as const,
      city: '旧金山',
      tempF: Math.round(cur.temperature_2m),
      feelsLikeF: Math.round(cur.apparent_temperature),
      humidity: Math.round(cur.relative_humidity_2m),
      windMph: Math.round(cur.wind_speed_10m),
      weatherCode,
      label,
      emoji,
      rainProbability: daily?.precipitation_probability_max?.[0] ?? 0,
      highF: Math.round(daily?.temperature_2m_max?.[0] ?? cur.temperature_2m),
      lowF: Math.round(daily?.temperature_2m_min?.[0] ?? cur.temperature_2m),
      fetchedAt: new Date().toISOString(),
      ttlSeconds: ttlMsToSeconds(WEATHER_CACHE_TTL),
      cache_hit: false,
    };

    setCache(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (error) {
    const stale = getStaleCache(cacheKey);
    if (stale?.data) {
      return res.status(200).json({ ...stale.data, cache_hit: true, stale: true });
    }
    console.error('[Weather] Error:', error instanceof Error ? error.message : error);
    return res.status(200).json({
      status: 'unavailable',
      city: '旧金山',
      fetchedAt: new Date().toISOString(),
      ttlSeconds: 0,
      cache_hit: false,
    });
  }
}
