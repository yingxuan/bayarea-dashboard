import { del, get, set } from 'idb-keyval';

export type MusthavePlace = {
  key: string;
  name: string;
  city: string;
  tags?: string[];
  addressHint?: string;
  place_id?: string;
  disabled?: boolean;
  disabledReason?: string;
  validation?: {
    resolvedName?: string;
    resolvedAddress?: string;
    rating?: number;
    userRatingCount?: number;
  };
};

type CanonicalPayload = {
  generatedAt?: string;
  version?: string;
  places?: Array<{
    key: string;
    name: string;
    city: string;
    tags?: string[];
    addressHint?: string;
    place_id?: string;
    disabled?: boolean;
    disabledReason?: string;
    resolved?: {
      displayName?: string;
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
    };
  }>;
};

const CANONICAL_URL = '/api/spend/musthave';
export const MUSTHAVE_VERSION_KEY = 'musthave:version';
const CACHE_PREFIX = 'musthave:v';

let cachedPromise: Promise<{ version: string; places: MusthavePlace[] }> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`fetch ${url} failed (${resp.status})`);
  }
  return resp.json();
}

async function cacheCanonical(version: string, places: MusthavePlace[]) {
  const cacheKey = `${CACHE_PREFIX}${version}`;
  const currentVersion = typeof window !== 'undefined' ? localStorage.getItem(MUSTHAVE_VERSION_KEY) : null;
  if (currentVersion && currentVersion !== version) {
    await del(`${CACHE_PREFIX}${currentVersion}`);
  }
  await set(cacheKey, { version, places });
  if (typeof window !== 'undefined') {
    localStorage.setItem(MUSTHAVE_VERSION_KEY, version);
  }
}

async function loadFromCache(): Promise<{ version: string; places: MusthavePlace[] } | null> {
  if (typeof window === 'undefined') return null;
  const version = localStorage.getItem(MUSTHAVE_VERSION_KEY);
  if (!version) return null;
  const cached = await get<{ version: string; places: MusthavePlace[] }>(`${CACHE_PREFIX}${version}`);
  if (!cached) {
    localStorage.removeItem(MUSTHAVE_VERSION_KEY);
    return null;
  }
  return { version, places: cached.places };
}

export async function loadMusthavePlaceIds(): Promise<{ version: string; places: MusthavePlace[] }> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    try {
      const payload = await fetchJson<CanonicalPayload>(CANONICAL_URL);
      const version = payload.version || payload.generatedAt || new Date().toISOString();
      const places = (payload.places || [])
        .filter((p) => p.name && p.city)
        .map((p) => ({
          key: p.key,
          name: p.name,
          city: p.city,
          tags: p.tags,
          addressHint: p.addressHint,
          place_id: p.place_id,
          disabled: p.disabled,
          disabledReason: p.disabledReason,
          validation: {
            resolvedName: p.resolved?.displayName,
            resolvedAddress: p.resolved?.formattedAddress,
            rating: p.resolved?.rating,
            userRatingCount: p.resolved?.userRatingCount,
          },
        }));
      await cacheCanonical(version, places);
      return { version, places };
    } catch (error) {
      console.warn('[musthave] canonical load failed', error);
      const cached = await loadFromCache();
      if (cached) {
        console.debug('[musthave] using cached version', cached.version);
        return cached;
      }
      throw error;
    }
  })();
  return cachedPromise;
}
