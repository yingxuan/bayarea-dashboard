import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { SNAPSHOT_KEY, WINDOW_DAYS } from './new-places-config.js';
import type { NewPlacesSnapshot } from './new-places-types.js';

export async function getCachedNewPlacesSnapshot(): Promise<NewPlacesSnapshot | null> {
  return (await kv.get<NewPlacesSnapshot>(SNAPSHOT_KEY)) || null;
}

export async function handleNewPlaces(req: VercelRequest, res: VercelResponse) {
  const snapshot = await getCachedNewPlacesSnapshot();
  res.setHeader('X-NewPlaces-WindowDays', String(WINDOW_DAYS));
  if (!snapshot) {
    res.setHeader('X-NewPlaces-Source', 'none');
    return res.status(200).json({ generatedAt: null, windowDays: WINDOW_DAYS, places: [] });
  }
  res.setHeader('X-NewPlaces-Source', 'snapshot');
  res.setHeader('X-NewPlaces-GeneratedAt', snapshot.generatedAt);
  return res.status(200).json(snapshot);
}
