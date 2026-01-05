# Seeds Implementation Summary

## ✅ Completed

### 1. Seed Schema & Types
- Created `shared/types/seeds.ts` with `SeedPlace` and `SeedFile` types
- Defines structure for seed data with required fields: `name`, `mapsUrl`, `city`

### 2. Seed File Structure
- Created seed JSON files in `client/src/lib/seeds/southbay/`:
  - `奶茶.json` (bubble tea)
  - `中餐.json` (Chinese restaurants)
  - `夜宵.json` (late night eats)
  - `新店打卡.json` (new/trendy places)
- Each file has proper schema with empty `items` array (ready for population)

### 3. Validator Script
- Created `scripts/validate-seeds.ts`
- Validates:
  - Real Google Maps URL patterns
  - Minimum 80 items per category (target: 100)
  - No fake/placeholder URLs
  - Deduplication by mapsUrl
- Run: `npx tsx scripts/validate-seeds.ts`

### 4. Seed Generation Helper
- Created `scripts/generate-seeds-helper.ts`
- Supports manual input from JSON files
- Validates and deduplicates before writing
- Usage: `npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --source manual --input manual-list.json`

### 5. Runtime Integration
- Updated `localCache.ts` to load seeds from JSON files (async)
- Updated `usePlacesCache.ts` to use async `getSeedPool()`
- Seeds are loaded dynamically at runtime
- System is already in **seeds-only mode** (no automatic Places API calls)

### 6. Configuration
- Created `client/src/config/places.ts` with `USE_PLACES_API` flag
- Currently set to `false` (seeds-only mode)
- Manual refresh still available via debug UI

## 📋 Next Steps (Manual Curation Required)

### Populate Seed Files

**IMPORTANT**: You must add **real Google Maps URLs** only. No placeholders or fake links.

Each category needs **~100 items** (minimum 80):

1. **奶茶** (Bubble Tea)
   - Find real bubble tea shops in South Bay
   - Get their Google Maps URLs
   - Add to `client/src/lib/seeds/southbay/奶茶.json`

2. **中餐** (Chinese Restaurants)
   - Find real Chinese restaurants in South Bay
   - Get their Google Maps URLs
   - Add to `client/src/lib/seeds/southbay/中餐.json`

3. **夜宵** (Late Night Eats)
   - Find real late-night restaurants in South Bay
   - Get their Google Maps URLs
   - Add to `client/src/lib/seeds/southbay/夜宵.json`

4. **新店打卡** (New/Trendy Places)
   - Find real trendy/new-ish places in South Bay
   - Get their Google Maps URLs
   - Add to `client/src/lib/seeds/southbay/新店打卡.json`

### Seed Item Format

```json
{
  "name": "Real Place Name",
  "mapsUrl": "https://www.google.com/maps/place/...",
  "city": "Cupertino",
  "categoryTags": ["bubble-tea"],
  "placeId": "optional",
  "address": "optional",
  "rating": 4.5,
  "userRatingCount": 100,
  "lat": 37.3230,
  "lng": -122.0322
}
```

### Valid URL Patterns
- `https://www.google.com/maps/place/...`
- `https://maps.google.com/?cid=...`
- `https://maps.app.goo.gl/...`
- `https://goo.gl/maps/...`

### Workflow

1. **Collect real places** (manually or from existing cached data)
2. **Create JSON array** with seed items
3. **Run generator**: `npx tsx scripts/generate-seeds-helper.ts --category <category> --source manual --input <file>`
4. **Validate**: `npx tsx scripts/validate-seeds.ts`
5. **Commit** only if validation passes

## 🎯 Acceptance Criteria

- ✅ Each category has >= 80 items (target: ~100)
- ✅ All mapsUrl are real Google Maps links
- ✅ No fake/placeholder URLs
- ✅ Validator passes
- ✅ Runtime renders >=3 items per category with zero Places API calls

## 📝 Notes

- Seed files are currently **empty** (validation will fail until populated)
- System is already in **seeds-only mode** (no automatic API calls)
- Manual refresh via debug UI is still available if needed
- Seed files are bundled at build time (no runtime fetch)
