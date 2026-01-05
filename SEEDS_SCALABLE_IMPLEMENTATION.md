# Scalable Seeds Implementation Summary

## ✅ Completed

### 1. **Updated Seed Schema** (`shared/types/seeds.ts`)
- Added `mapsType?: 'place' | 'search'` field
- Added `query?: string` field for search URLs
- Supports both direct place links and search URLs

### 2. **Relaxed Validator** (`scripts/validate-seeds.ts`)
- Now accepts Google Maps Search URLs:
  - `https://www.google.com/maps/search/?api=1&query=...`
  - `https://www.google.com/maps?q=...`
- Still validates place links (original patterns)
- Rejects non-Google domains and fake/placeholder URLs
- Normalizes URLs for deduplication (handles query encoding)

### 3. **Improved Seed Generation Helper** (`scripts/generate-seeds-helper.ts`)
- **CSV input format**: `category,name,city,tags`
- **Plain text format**: `name | city | tags` or `name city`
- Automatically generates search URLs from name + city
- Supports `--merge` flag to append to existing seeds
- Deduplicates by normalized mapsUrl

**Usage:**
```bash
# From CSV
npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input client/src/lib/seeds/southbay/_inputs/bubble-tea.csv

# From text file
npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input list.txt --format text

# Merge with existing
npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input new.csv --merge
```

### 4. **Seed Builder UI** (in `DebugPanel.tsx`)
- Dev-only UI (visible with `?debug=1`)
- Textarea for pasting lists
- Category selector
- Generates seeds and downloads JSON
- Supports CSV, pipe, or space-separated formats

### 5. **Starter CSV Templates**
Created in `client/src/lib/seeds/southbay/_inputs/`:
- `bubble-tea.csv` - 30 starter bubble tea shops
- `chinese.csv` - 30 starter Chinese restaurants
- `late-night.csv` - 30 starter late-night places
- `new-ish.csv` - 30 starter trendy places

Each template has ~30 items as examples. Users can expand by adding more lines.

### 6. **Runtime Integration**
- `localCache.ts` loads seeds from JSON files (async)
- Seeds are treated as authoritative pools
- System is in seeds-only mode (no Places API calls)
- "换一批" rotates within seed pools

## 📋 How to Populate Seeds

### Method 1: Use Starter CSVs
```bash
# Generate from starter CSV
npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input client/src/lib/seeds/southbay/_inputs/bubble-tea.csv --output client/src/lib/seeds/southbay/奶茶.json

# Expand CSV with more items, then merge
npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input expanded.csv --merge
```

### Method 2: Use Seed Builder UI
1. Open app with `?debug=1`
2. Open Debug Panel
3. Click "Show" on Seed Builder
4. Select category
5. Paste list (one per line: `name, city` or `name | city`)
6. Click "Generate & Download JSON"
7. Replace the seed JSON file with downloaded file

### Method 3: Manual CSV Creation
Create a CSV file:
```csv
category,name,city,tags
奶茶,Boba Guys,Cupertino,bubble-tea
奶茶,Tpumps,Sunnyvale,bubble-tea
...
```

Then run:
```bash
npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input your-file.csv
```

## 🎯 Acceptance

- ✅ Validator accepts search URLs
- ✅ Generator creates search URLs from name + city
- ✅ Seed Builder UI available in debug mode
- ✅ Starter templates provided
- ✅ Runtime uses seeds-only mode (0 Places API calls)
- ⚠️  Seed files need to be populated (currently have 30 items each, need 80+)

## 📝 Next Steps

1. **Expand starter CSVs** to reach 80+ items per category
2. **Generate seed JSON files** from expanded CSVs
3. **Validate**: `npx tsx scripts/validate-seeds.ts`
4. **Test**: Homepage should show >=3 items per category with zero Places API calls

## 🔍 Notes

- Search URLs are real, clickable Google Maps links
- They redirect to the actual place page when clicked
- No Places API needed to generate them
- Much more scalable than manually copying 400 place links
