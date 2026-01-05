# Context Summary for Next Agent

## Project Overview

**Bay Area Engineer's Daily Decision Dashboard** - A judgment-based information hub for Chinese software engineers in the SF Bay Area. The dashboard provides curated information about money, work, and life decisions with a cyberpunk-inspired "Data Punk" design aesthetic.

## Recent Changes

### Files Modified
Two seed data files were recently updated (formatting changes only - content unchanged):

1. **`client/src/lib/seeds/southbay/_musthave/中餐.musthave.json`**
   - Chinese restaurant must-have list
   - Contains 23 restaurants with tags (taiwanese, cantonese, sichuan, etc.)
   - Formatting: JSON array formatting standardized

2. **`client/src/lib/seeds/southbay/_musthave/夜宵.musthave.json`**
   - Late-night food must-have list
   - Contains 18 restaurants with late-night tags
   - Formatting: JSON array formatting standardized

**Note**: These changes appear to be whitespace/formatting only - no content changes were made.

## Seed Data System Architecture

### Structure
- **Main seed files**: `client/src/lib/seeds/southbay/{category}.json`
  - Categories: `奶茶` (bubble tea), `中餐` (Chinese food), `夜宵` (late-night), `新店打卡` (new/trendy)
  
- **Must-have files**: `client/src/lib/seeds/southbay/_musthave/{category}.musthave.json`
  - Priority restaurants that should always be included
  - Merged into main seed files using `scripts/merge-musthave-seeds.ts`

### How It Works
1. Must-have files contain simplified restaurant data (name, city, tags)
2. `merge-musthave-seeds.ts` script merges must-have items into main seed files
3. Must-have items take priority in conflicts (same canonicalKey)
4. Main seed files are loaded at runtime by `client/src/lib/places/localCache.ts`
5. Used by `client/src/hooks/usePlacesCache.ts` to provide restaurant recommendations

### Key Scripts
- **`scripts/merge-musthave-seeds.ts`**: Merges must-have files into main seed files
- **`scripts/validate-seeds.ts`**: Validates seed data (real URLs, minimum counts, etc.)
- **`scripts/generate-seeds-helper.ts`**: Helper for manual seed generation

## Current State

### Seed Data Status
- System is in **seeds-only mode** (`USE_PLACES_API = false` in `client/src/config/places.ts`)
- Seed files are loaded dynamically at runtime
- Must-have system ensures priority restaurants are always included

### Uncommitted Files (from git status)
```
?? api/community/leeks.ts
?? api/spend/today.ts
?? client/src/components/SpendCarousel.tsx
?? data/portfolio-value-series.json
?? scripts/test-1p3a-rss.ts
```

## Technical Stack

- **Frontend**: React 19 + TypeScript, Tailwind CSS 4, Wouter routing
- **Backend**: Express server with API routes
- **Data**: Seed-based restaurant data (no live API calls currently)
- **Build**: Vite, pnpm package manager

## Key Directories

- `client/src/lib/seeds/southbay/` - Seed data files
- `client/src/lib/places/` - Places cache and data loading
- `client/src/hooks/` - React hooks for data fetching
- `scripts/` - Build and data management scripts
- `api/` - API route handlers

## Next Steps (Potential)

1. **Run merge script**: If must-have files were updated, may need to run `npx tsx scripts/merge-musthave-seeds.ts` to update main seed files
2. **Validate seeds**: Run `npx tsx scripts/validate-seeds.ts` to ensure data integrity
3. **Review uncommitted files**: Check if new files need to be committed or removed

## Important Notes

- All API keys are server-side only (never exposed to frontend)
- Seed files require real Google Maps URLs (no placeholders)
- Must-have items always win in merge conflicts
- System currently uses seeds-only mode (no automatic Places API calls)
