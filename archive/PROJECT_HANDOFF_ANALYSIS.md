# Project Handoff Analysis & Execution Plan

## Current State Assessment

### ✅ Working Correctly

1. **Market API (`/api/market`)** - ✅ CORRECT
   - BTC: Using CoinGecko API (real data)
   - SPY: Using Stooq API (real data)
   - Gold: Using Stooq API (real data)
   - Powerball: "Unavailable" with powerball.com source_url ✅
   - Mortgage: "Unavailable" ✅
   - Proper cache metadata and ?nocache=1 support ✅

2. **Gossip API (`/api/gossip`)** - ✅ CORRECT
   - Uses public Hacker News API (no key required)
   - Should work out of the box

3. **Deals API (`/api/deals`)** - ✅ CORRECT
   - Uses public Reddit API (no key required)
   - Should work out of the box

### ❌ Issues Found

1. **AI News API (`/api/ai-news`)** - ❌ RETURNS EMPTY ARRAY
   - **Root Cause**: NEWS_API_KEY likely not configured in Vercel
   - **Secondary Issue**: Domain filtering might be too strict (only allows specific domains)
   - **Current Behavior**: Returns `{"news":[]}` with no error message
   - **Required Fix**: 
     - Add NEWS_API_KEY to Vercel environment variables (documented in NEWSAPI_SETUP.md)
     - OR improve error handling to show clear message when key is missing
     - Review domain allowlist - might be filtering out valid articles

2. **Restaurants API (`/api/restaurants`)** - ⚠️ REQUIRES YELP_API_KEY
   - Will fail if YELP_API_KEY not configured
   - Should return graceful error or empty array

3. **Shows API (`/api/shows`)** - ⚠️ REQUIRES TMDB_API_KEY
   - Will fail if TMDB_API_KEY not configured
   - Should return graceful error or empty array

### 🔍 Code Quality Issues

1. **Domain Filtering Bug**: In `api/ai-news.ts`, the `isArticleValid` function uses `new URL(url)` which will throw if URL is invalid. Need try-catch.

2. **Mock Data**: 
   - `server/` directory contains old code with mock data fallbacks (not used in production)
   - `client/src/lib/mockData.ts` exists but frontend uses real APIs
   - Should verify no mock data is used in production paths

## Execution Plan

### Phase 1: Fix Critical Issues (AI News)

1. **Fix AI News API**:
   - Add error handling for invalid URLs in `isArticleValid`
   - Improve error message when NEWS_API_KEY is missing
   - Consider relaxing domain filter OR document that it's intentional
   - Test with ?nocache=1

2. **Verify NEWS_API_KEY Configuration**:
   - Check if NEWS_API_KEY is set in Vercel
   - If not, document that it needs to be added
   - Provide clear error message in API response

### Phase 2: Verify Other Endpoints

1. **Test all endpoints with ?nocache=1**:
   - `/api/market?nocache=1` ✅ (already tested)
   - `/api/ai-news?nocache=1` ❌ (returns empty)
   - `/api/restaurants?nocache=1` (test)
   - `/api/shows?nocache=1` (test)
   - `/api/gossip?nocache=1` (test)
   - `/api/deals?nocache=1` (test)

2. **Verify error handling**:
   - All endpoints should handle missing API keys gracefully
   - Should return empty arrays or clear error messages
   - Should NOT crash or return 500 errors

### Phase 3: Remove Mock Data (If Any)

1. **Verify no mock data in production**:
   - Check `api/` directory (Vercel serverless functions)
   - Verify frontend doesn't use mock data as fallback
   - Remove or document any mock data files

2. **Verify frontend handles empty data**:
   - Empty arrays should show "No data available" or hide sections
   - Should NOT show mock/placeholder data

### Phase 4: Final Verification

1. **Test live endpoints**:
   - Get raw JSON from all endpoints with ?nocache=1
   - Verify data structure matches requirements
   - Verify source URLs are clickable and valid

2. **Test news URL filtering**:
   - Verify no stock quote pages in news results
   - Spot check 3-5 news URLs to ensure they're real articles
   - Verify domain allowlist is working correctly

3. **Document findings**:
   - Create evidence report with live JSON responses
   - Create click-test checklist for news URLs
   - Document any remaining issues or limitations

## Definition of Done Checklist

- [ ] `/api/market?nocache=1` returns realistic BTC/SPY/Gold values ✅ (already working)
- [ ] `/api/market?nocache=1` returns Powerball = "Unavailable" + powerball.com source_url ✅ (already working)
- [ ] `/api/ai-news?nocache=1` returns real article URLs (not stock quote pages) ❌ (currently empty)
- [ ] All news URLs are clickable and open real articles ❌ (need to test once fixed)
- [ ] No mock data in production code paths ✅ (need to verify)
- [ ] All endpoints support ?nocache=1 ✅ (already implemented)
- [ ] All endpoints return proper cache metadata ✅ (already implemented)

## Next Steps

1. Fix AI News API domain filtering bug
2. Test all endpoints with ?nocache=1
3. Verify NEWS_API_KEY is configured in Vercel
4. Create evidence report with live JSON responses
5. Test news URLs are real articles (not stock quotes)
