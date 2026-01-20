import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs/promises';

const CANONICAL_PATH = new URL('../../data/spend/musthave.placeids.json', import.meta.url);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const body = await fs.readFile(CANONICAL_PATH, 'utf8');
    const payload = JSON.parse(body);
    const version = payload.version || payload.generatedAt || new Date().toISOString();
    payload.version = version;
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(payload);
  } catch (error: any) {
    console.error('[musthave] failed to load canonical data', error);
    return res.status(500).json({
      error: 'failed_to_load_musthave',
      message: error?.message || 'unknown',
    });
  }
}
