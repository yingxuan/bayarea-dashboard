# Seed Enrichment Script

Offline script to enrich seed JSON files with Google Places API data (placeId, rating, userRatingCount, photos).

## Usage

```bash
# Enrich a single category
pnpm tsx scripts/enrich-seeds-with-places.ts 奶茶

# Enrich all categories
pnpm tsx scripts/enrich-seeds-with-places.ts all

# Dry run (test without modifying files)
pnpm tsx scripts/enrich-seeds-with-places.ts 中餐 --dry-run

# Test with limited items
pnpm tsx scripts/enrich-seeds-with-places.ts 夜宵 --max-items=5
```

## Prerequisites

1. Set `GOOGLE_PLACES_API_KEY` environment variable
2. Ensure you have API quota available (script makes 1-2 calls per item)

## What It Does

For each seed item:
1. **Resolves placeId** using `places:searchText` (if not already present)
   - Matches by name + city
   - Confidence threshold: 0.7 (auto-assigns if score >= 0.7)
   - Lower confidence items marked for manual review

2. **Fetches place details** using `places/{placeId}` (if placeId found)
   - Gets rating, userRatingCount, googleMapsUri, photos
   - Stores photoName (New API) or photoReference (Legacy)

3. **Writes back to seed JSON**
   - Preserves all existing fields
   - Adds enrichment fields (placeId, rating, userRatingCount, etc.)
   - Updates `updatedAt` timestamp

## Output

- **Modified seed files**: `client/src/lib/seeds/southbay/{category}.json`
- **Review reports**: `scripts/output/enrich-review-{category}.csv`
- **Cache**: `.cache/places-enrich-cache.json` (for resumability)

## Features

- **Resumable**: Cache prevents re-calling API for already enriched items
- **Rate limited**: 1 request/second to avoid quota issues
- **Graceful error handling**: Quota errors stop processing but save partial progress
- **Confidence scoring**: Only auto-assigns placeId if match confidence >= 0.7

## After Enrichment

Once seed files are enriched:
- UI will automatically use `rating` and `userRatingCount` from seeds
- UI will use `photoName`/`photoReference` via server proxy (`/api/spend/place-photo`)
- No runtime API calls needed for enriched items
- Cards will show unique images and real ratings
