# Local Verification Plan

## Project Structure Analysis

### Current Setup
- **Frontend**: Vite dev server on port 3000 (from `vite.config.ts`)
- **Backend**: Two implementations exist:
  1. **Production**: Vercel serverless functions in `api/` directory
  2. **Legacy**: Express server in `server/` directory (uses Google CSE - old approach)

### Key Finding
The production code uses Vercel serverless functions (`api/market.ts`, `api/ai-news.ts`), NOT the Express server.

## Local Testing Strategy

### Option 1: Use `vercel dev` (Recommended)
Vercel CLI can run serverless functions locally, simulating the production environment.

### Option 2: Create Local Adapter
Wrap Vercel functions in Express routes for local testing.

## Verification Checklist

### Prerequisites
- [ ] `pnpm install` completed
- [ ] Environment variables set (`.env` file or `vercel dev` will use Vercel env vars)
  - `NEWS_API_KEY` (required for `/api/ai-news`)
  - Optional: `YELP_API_KEY`, `TMDB_API_KEY`

### Step 1: Start Local Development
```bash
# Terminal 1: Start Vercel dev server (runs API functions)
vercel dev

# Terminal 2: Start Vite dev server (frontend)
pnpm dev
```

**Expected**: 
- Vercel dev server on port 3000 (or next available)
- Vite dev server on port 3001 (or next available)
- API endpoints available at `http://localhost:3000/api/*`

### Step 2: Test Market API
```bash
curl "http://localhost:3000/api/market?nocache=1"
```

**Verification**:
- [ ] HTTP 200 response
- [ ] JSON structure matches expected format
- [ ] `data.btc.value` is a realistic number (e.g., 50,000-150,000)
- [ ] `data.spy.value` is a realistic number (e.g., 400-800)
- [ ] `data.gold.value` is a realistic number (e.g., 1,500-3,000)
- [ ] `data.powerball.value` is "Unavailable"
- [ ] `data.powerball.source_url` is "https://www.powerball.com/"
- [ ] `fetched_at` is present and recent (within last minute)
- [ ] `cache_hit: false` (because of ?nocache=1)

### Step 3: Test AI News API
```bash
curl "http://localhost:3000/api/ai-news?nocache=1"
```

**Verification**:
- [ ] HTTP 200 response
- [ ] JSON structure matches expected format
- [ ] `news` array contains 4-5 articles (or empty with debug info if NEWS_API_KEY missing)
- [ ] Each article has:
  - [ ] `title` (string, non-empty)
  - [ ] `url` (string, starts with https://)
  - [ ] `source_name` (string)
  - [ ] `snippet` (string)
  - [ ] `summary_zh` (string)
  - [ ] `why_it_matters_zh` (string)
- [ ] No URLs contain `/quote/`, `/symbol/`, or `/stock/`
- [ ] All URLs are from allowed domains (check `ALLOWED_DOMAINS` list)
- [ ] `fetched_at` is present and recent
- [ ] `cache_hit: false` (because of ?nocache=1)

### Step 4: Test Cache Bypass
```bash
# First request
curl "http://localhost:3000/api/market?nocache=1" | jq '.cache_hit'
# Expected: false

# Second request (without nocache)
curl "http://localhost:3000/api/market" | jq '.cache_hit'
# Expected: true (if within cache TTL)
```

### Step 5: Test Other Endpoints (Optional)
```bash
curl "http://localhost:3000/api/gossip?nocache=1"
curl "http://localhost:3000/api/deals?nocache=1"
curl "http://localhost:3000/api/restaurants?nocache=1"  # Requires YELP_API_KEY
curl "http://localhost:3000/api/shows?nocache=1"       # Requires TMDB_API_KEY
```

## Files to Verify

### Production API Functions (Primary)
- `api/market.ts` - Market data endpoint
- `api/ai-news.ts` - AI news endpoint
- `api/gossip.ts` - Hacker News gossip
- `api/deals.ts` - Reddit deals
- `api/restaurants.ts` - Yelp restaurants (optional)
- `api/shows.ts` - TMDB shows (optional)

### Configuration Files
- `vercel.json` - Vercel deployment config
- `vite.config.ts` - Frontend dev server config
- `.env` or Vercel env vars - API keys

## Risk Assessment

### Low Risk
- Testing locally with `vercel dev` matches production environment
- Cache behavior can be verified immediately with `?nocache=1`
- No mock data in production code paths

### Medium Risk
- Environment variables must be set correctly
- NewsAPI free tier has rate limits (100 requests/day)
- Some endpoints require API keys (restaurants, shows)

### High Risk
- None identified

## Next Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   pnpm add -D vercel
   ```

2. **Create `.env.local` file** (for local testing):
   ```
   NEWS_API_KEY=your_key_here
   ```

3. **Run verification checklist above**

4. **Document results** with:
   - Exact curl commands run
   - Trimmed output showing key fields
   - Pass/fail status for each check
