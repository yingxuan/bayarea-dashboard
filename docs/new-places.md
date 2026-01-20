## New Places (Last 6 Months)

`新店打卡` now runs a **daily discovery + scoring job** against Google Places and stores the result in KV. The runtime API only reads that cached snapshot (`newplaces:snapshot:v2`) so it is fast, deterministic, and can run without any Google credentials.

### Daily discovery overview
1. **Geo tiles + multi queries** — The scheduler runs 8 South Bay tiles (Cupertino, Sunnyvale, Santa Clara, Mountain View, San Jose, Milpitas, Fremont) with keyword sets for both `chinese` and `milk-tea`. The job deduplicates up to ~250 unique place IDs per day.
2. **History tracking** — Each candidate updates `place:history:v1:<placeId>` (firstSeenAt, lastSeenAt, rating/userRatingCount metrics). These histories keep a 35-day rolling view of rating/review counts plus earliest-review caches.
3. **Selective Place Details** — The job fetches `reviews.publishTime` for candidates that look fresh (low review count or recent firstSeen). Details calls are throttled to 4 concurrent + 200ms spacing, and the response caches the earliest review time along with metadata.
4. **Newness + scoring** — Only entries whose earliest review is within 180 days (or “possible new” by recency + low reviews) survive. A score (and `why[]` reasons) is built from review recency, firstSeen date, growth over the last week, rating, etc.
5. **Snapshot writing** — The top 12–20 scored places are written to `newplaces:snapshot:v2` with metadata (`tiles`, `queries`, `candidates`, `generatedAt`). The snapshot expires after 3 days, ensuring daily refresh.

### Runtime API (`/api/spend/new-places`)
* Reads `newplaces:snapshot:v2` and returns it verbatim.
* Adds headers `X-NewPlaces-Source`, `X-NewPlaces-GeneratedAt`, and `X-NewPlaces-WindowDays`.
* If no snapshot exists, returns an empty payload with `X-NewPlaces-Source: none`.
* No Google client is referenced anywhere in this code path.

### Refresh tooling
* **Local / manual:** `DOTENV_CONFIG_PATH="./env" pnpm refresh-new-places`
* **Admin endpoint:** POST `/api/admin/refresh-new-places` with header `x-refresh-new-places-token=<secret>` (set `NEW_PLACES_REFRESH_SECRET`). The endpoint respects the lock (`newplaces:refresh:lock:v1`) to avoid overlapping runs.
* **Automation:** Use a GitHub Actions or Vercel cron job that runs `pnpm refresh-new-places` daily with env vars `GOOGLE_PLACES_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and the admin secret.

### Notes
* The refresh job stores `place:history:v1:<placeId>` (TTL ~400 days) with firstSeen/lastSeen, rating metrics, and earliest-review caching. Rechecks are throttled so we don’t hammer Places Details.
* Each place in the snapshot includes a `score` and `why[]` so you can see why it made the list.
* The job never overwrites the last snapshot unless the new run fully succeeds.

### Summary
* Daily discovery job is the only bearer of Google calls.
* Runtime `/api/spend/new-places` solely reads KV and is cheap & reliable.
* Manual/admin tooling plus cron-friendly scripts keep the snapshot fresh.
