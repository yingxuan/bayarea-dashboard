import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type PhotoIndex = Record<string, string[]>;
type IndexStatus = 'loaded' | 'missing' | 'error';

let cachedIndex: PhotoIndex | null = null;
let indexStatus: IndexStatus = 'missing';

function loadPhotoIndex(): PhotoIndex {
  if (cachedIndex !== null) {
    return cachedIndex;
  }

  try {
    const indexPath = join(process.cwd(), 'data', 'place_photos', 'index.v1.json');

    if (!existsSync(indexPath)) {
      indexStatus = 'missing';
      const emptyIndex: PhotoIndex = {};
      cachedIndex = emptyIndex;
      return emptyIndex;
    }

    const raw = readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const loadedIndex: PhotoIndex = parsed && typeof parsed === 'object' ? parsed : {};
    cachedIndex = loadedIndex;
    indexStatus = 'loaded';
    return loadedIndex;
  } catch (error) {
    console.error('[photo-index] Failed to load place photo index', error);
    indexStatus = 'error';
    const emptyIndex: PhotoIndex = {};
    cachedIndex = emptyIndex;
    return emptyIndex;
  }
}

export function resolveLocalPhoto(placeId: string | undefined): {
  url?: string;
  choices: string[];
  status: 'hit' | 'miss';
  indexStatus: IndexStatus;
} {
  if (!placeId) {
    return { url: undefined, choices: [], status: 'miss', indexStatus };
  }

  const index = loadPhotoIndex();
  const entries = Array.isArray(index[placeId]) ? index[placeId] : [];
  const normalized = entries
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .map((p) => {
      const cleaned = p.replace(/^\/+/, '');
      return cleaned.startsWith('place-photos/') ? `/${cleaned}` : `/${cleaned}`;
    });

  const url = normalized[0];

  if (url) {
    return {
      url,
      choices: normalized,
      status: 'hit',
      indexStatus,
    };
  }

  // Deterministic fallback path: assume photos live at /place-photos/<place_id>/0.jpg
  const guessed = `/place-photos/${placeId}/0.jpg`;
  return {
    url: guessed,
    choices: [guessed],
    status: 'miss',
    indexStatus,
  };
}

export function getPhotoIndexStatus(): IndexStatus {
  loadPhotoIndex();
  return indexStatus;
}
