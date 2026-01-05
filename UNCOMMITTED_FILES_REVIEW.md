# Uncommitted Files Review

Generated: 2026-01-05

## Summary

After running the merge script and validation, here's a review of all uncommitted files:

## ✅ Should Commit (Core Seed System)

### Modified Files
- **`client/src/lib/seeds/southbay/奶茶.json`** - Updated by merge script (merged must-have items)
- **`package.json`** - Added `idb-keyval` dependency (for client-side caching)
- **`pnpm-lock.yaml`** - Lock file update for new dependency

### New Seed System Files
- **`client/src/lib/seeds/southbay/中餐.json`** - Chinese restaurants seed file
- **`client/src/lib/seeds/southbay/夜宵.json`** - Late-night food seed file  
- **`client/src/lib/seeds/southbay/新店打卡.json`** - New/trendy places seed file
- **`client/src/lib/seeds/southbay/_musthave/`** - Must-have priority seed files
- **`client/src/lib/seeds/southbay/_inputs/bubble-tea.csv`** - Input CSV for seed generation
- **`client/src/lib/seeds/southbay/README.md`** - Seed system documentation

### Seed System Scripts
- **`scripts/merge-musthave-seeds.ts`** - Merges must-have files into main seeds
- **`scripts/validate-seeds.ts`** - Validates seed data integrity
- **`scripts/generate-all-seeds.ts`** - Generates seed files from CSV inputs
- **`scripts/generate-seeds-helper.ts`** - Helper for manual seed generation
- **`scripts/enrich-seeds-with-places.ts`** - Enriches seeds with Places API data
- **`scripts/resolve-seeds-to-placeid.ts`** - Resolves seeds to place IDs
- **`scripts/check-duplicates.ts`** - Checks for duplicate entries
- **`scripts/check-milktea-duplicates.ts`** - Bubble tea specific duplicate checker
- **`scripts/check-pool-duplicates.ts`** - Pool-specific duplicate checker
- **`scripts/clean-bubble-tea-seeds.ts`** - Cleans bubble tea seed data
- **`scripts/cleanup-all-seeds.ts`** - General seed cleanup script

### Documentation
- **`CONTEXT_SUMMARY.md`** - Context summary for next agent
- **`SEEDS_IMPLEMENTATION.md`** - Seed system implementation documentation
- **`scripts/ENRICH_SEEDS_README.md`** - Enrichment process documentation

### Client-Side Seed Integration
- **`client/src/lib/places/localCache.ts`** - Loads seeds from JSON files
- **`client/src/lib/places/enrichmentCache.ts`** - Enrichment caching
- **`client/src/lib/places/hoursEnrichment.ts`** - Hours enrichment logic
- **`client/src/lib/places/placeEnricher.ts`** - Place enrichment service
- **`client/src/hooks/usePlacesCache.ts`** - React hook for places cache

### API Endpoints (Spend Feature)
- **`api/spend/today.ts`** - Today's spend recommendations
- **`api/spend/enrich-place.ts`** - Place enrichment endpoint
- **`api/spend/enrich-hours.ts`** - Hours enrichment endpoint
- **`api/spend/new-places.ts`** - New places endpoint
- **`api/spend/place-photo.ts`** - Place photo endpoint
- **`api/spend/placesClient.ts`** - Places API client
- **`api/spend/placesOptimized.ts`** - Optimized places fetching

## ⚠️ Review Needed

### Data Files
- **`data/portfolio-value-series.json`** - Modified portfolio data (check if intentional)

### Output/Review Files (May be Temporary)
- **`scripts/output/enrich-review-*.csv`** - Review CSV files (4 files)
  - `enrich-review-中餐.csv`
  - `enrich-review-夜宵.csv`
  - `enrich-review-奶茶.csv`
  - `enrich-review-新店打卡.csv`
  - **Recommendation**: These appear to be review/intermediate files. Consider adding `scripts/output/` to `.gitignore` if these are temporary.

### Utility Scripts
- **`scripts/review-enriched-data.js`** - Review script (may be temporary)

## 📋 Recommended Actions

### 1. Add to .gitignore (if temporary)
Consider adding if these are temporary/intermediate files:
```
scripts/output/
```

### 2. Commit Core Seed System
All seed system files, scripts, and documentation should be committed as they represent a complete feature.

### 3. Commit API Endpoints
The `api/spend/` endpoints appear to be a complete feature and should be committed.

### 4. Review Data File
Check if `data/portfolio-value-series.json` changes are intentional before committing.

## ✅ Validation Status

- ✅ Merge script completed successfully
- ✅ All seed files validated (0 errors, 0 warnings)
- ✅ Seed counts:
  - 奶茶: 38 items
  - 中餐: 32 items
  - 夜宵: 32 items
  - 新店打卡: 27 items

## Next Steps

1. Review `data/portfolio-value-series.json` changes
2. Decide if `scripts/output/` should be gitignored
3. Stage and commit seed system files
4. Stage and commit API endpoints
5. Stage and commit documentation
