# Photo Pipeline (Prefetch + On-Demand)

## Overview
- Photo identity key: `place_id`.
- Photo index stored in Vercel KV: `placephoto:v1:<place_id>`.
- Actual bytes stored in Vercel Blob at `place-photos/<place_id>/0.jpg` (public URL).
- Two stages:
  - Prefetch must-haves: run `pnpm tsx scripts/prefetch-must-have-photos.ts`.
  - On-demand long-tail: first render triggers `/api/spend/place-photo?place_id=...`; result is cached.

## KV Record
```json
{
  "url": "https://.../place-photos/<place_id>/0.jpg",
  "updatedAt": "2026-01-16T00:00:00Z",
  "source": "prefetch" | "ondemand",
  "status": "hit" | "miss" | "failed",
  "meta": { "place_id": "...", "google_photo_reference": "...", "reason": "..." }
}
```
TTL: hit 180d, miss 7d, failed 30m.

Lock: `placephoto:lock:v1:<place_id>` (60s) to avoid thundering herd.

## API
- `GET /api/spend/place-photo?place_id=...`
  - Calls `ensurePlacePhoto`.
  - Returns `{ place_id, photo_local_url, status }`.
  - Headers: `X-Photo-Source` (kv-hit/miss), `X-Photo-Fetch` (started/failed), `X-Photo-Lock` (acquired/waited).
- Versioning: photo cache and blob paths are versioned (current PHOTO_VERSION=v3). Use `refresh=1` to bypass cached hits and force a new selection/upload (writes a unique blob key).
- `/api/spend/today`, `/api/spend/new-places`
  - If KV has record, returns `photo_local_url` (non-blocking; no fetch).
  - Frontend will fetch on-demand if missing.

## Prefetch Script
Run: `pnpm tsx scripts/prefetch-must-have-photos.ts`
- Reads canonical must-have JSON (`data/musthave.placeids.json`) synced into `client/public/data`.
- Resolves `place_id` from that list (falls back to `data/*.musthave.json` if necessary).
- Calls `ensurePlacePhoto(place_id, 'prefetch')` with small concurrency.

## Frontend
- Uses `photo_local_url` if present.
- If missing, triggers `/api/spend/place-photo?place_id=...` once per place on first show; updates in-memory override when hit.
- While fetching, still shows deterministic fallback image.

## Selection logic (v3)
- Fetch up to 8 photo candidates via Places API (`photos.name,widthPx,heightPx`).
- Score up to 6 thumbnails (320px) with zero-shot CLIP; positive labels favor drink/food (bubble tea, milk tea, boba, drink, beverage, dessert, food), negative labels penalize storefront/interior/menu/logo/people.
- Score = best positive - best negative; must be >= 0.15 to select; otherwise fall back to first candidate.
- Final fetch at 800px stored to `place-photos/v3/<place_id>/0.jpg` (or `0-<ts>.jpg` when refresh=1).

## Env Vars
- `GOOGLE_PLACES_API_KEY` (required).
- Vercel Blob: `BLOB_READ_WRITE_TOKEN`, `BLOB_URL` (provided by Vercel).
- Vercel KV: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Verification
- Run prefetch script locally (requires API key + blob/kv env).
- Call `/api/spend/place-photo?place_id=...` and check headers/body; subsequent calls should be KV hits and reuse blob URL.

## How we verify Google Places is called only once
- Run: `PLACE_ID=<place_id> pnpm tsx scripts/verify-google-fetch-once.ts`
- The script fires concurrent requests (default 20) to `/api/spend/place-photo` and reports status distribution and the `X-Google-Fetch-Count` header (from KV key `metrics:google_places_fetch:v1:<placeId>`).
- Expected: only one Google call per place_id (max fetch count = 1); others return cache hit or `miss` with reason `fetching`.