# South Bay Seed Data

This directory contains seed data for food categories in South Bay (Cupertino, Sunnyvale, San Jose, Milpitas, and nearby cities).

## Files

- `奶茶.json` - Bubble tea / boba shops
- `中餐.json` - Chinese restaurants
- `夜宵.json` - Late-night eats
- `新店打卡.json` - New-ish / trendy places

## Requirements

- Each file must contain **at least 80 items** (target: ~100)
- All `mapsUrl` must be **real Google Maps links** (no placeholders)
- All items must be **real places** (no fake names or URLs)
- URLs must match one of these patterns:
  - `https://www.google.com/maps/place/...`
  - `https://maps.google.com/?cid=...`
  - `https://maps.app.goo.gl/...`
  - `https://goo.gl/maps/...`

## Schema

```typescript
{
  "version": 1,
  "category": "奶茶" | "中餐" | "夜宵" | "新店打卡",
  "region": "southbay",
  "updatedAt": "2024-01-01T00:00:00Z",
  "items": [
    {
      "name": "Place Name",
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
  ]
}
```

## Validation

Run the validator before committing:

```bash
npx tsx scripts/validate-seeds.ts
```

## Adding Seeds

**IMPORTANT**: Only add seeds with **real Google Maps URLs**. Do not commit placeholder or fake URLs.

To add seeds:
1. Find real places in South Bay
2. Get their Google Maps URLs
3. Add to the appropriate category JSON file
4. Run validator to check
5. Commit only if validation passes
