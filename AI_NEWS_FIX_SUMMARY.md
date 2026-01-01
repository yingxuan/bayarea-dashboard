# AI News API Fix Summary

## Issue
The `/api/ai-news` endpoint was returning an empty array even though `NEWS_API_KEY` was added to Vercel.

## Root Causes Identified

1. **Silent Error Handling**: Errors from NewsAPI queries were being caught but not surfaced in the response
2. **No Debug Information**: When articles were filtered out or queries failed, there was no visibility into what was happening
3. **Potential Free Tier Limitation**: NewsAPI's free tier might have restrictions on the "everything" endpoint

## Fixes Applied

### 1. Enhanced Error Reporting
- Added detailed logging for each query attempt
- Added debug information in API response when no articles found
- Shows which queries failed and why
- Shows sample domains when articles are filtered out

### 2. Fallback to Top-Headlines
- Added fallback to use `top-headlines` endpoint if `everything` endpoint fails
- Top-headlines is guaranteed to work on free tier
- Automatically switches if we detect upgrade/paid tier errors

### 3. Better Filtering Diagnostics
- Logs total articles fetched vs. filtered
- Shows sample domains when all articles are filtered out
- Helps identify if domain allowlist is too strict

## Code Changes

**File**: `api/ai-news.ts`

**Key Changes**:
1. Split `fetchNewsAPI` into `fetchNewsAPIEverything` and `fetchNewsAPIHeadlines`
2. Added fallback logic to try headlines if everything fails
3. Added debug information in response when no articles found
4. Enhanced logging throughout the fetch process

## Next Steps

1. **Redeploy to Vercel**: The changes need to be deployed for the improvements to take effect
2. **Test the endpoint**: After redeploy, test with:
   ```bash
   curl "https://bayarea-dashboard.vercel.app/api/ai-news?nocache=1"
   ```
3. **Check debug info**: If still empty, the response will now include `debug` field with:
   - Query errors (if queries failed)
   - Sample domains (if articles were filtered out)
   - Total fetched vs. filtered counts

## Expected Behavior After Fix

**If everything endpoint works**:
- Returns 4-5 articles from allowed domains
- Articles have Chinese summaries and "why it matters" explanations
- No stock quote pages (filtered out)

**If everything endpoint fails (free tier limitation)**:
- Automatically falls back to top-headlines
- Returns tech headlines from US sources
- Still applies domain filtering

**If all articles filtered out**:
- Returns empty array with debug info showing:
  - Which domains were rejected
  - Total articles fetched
  - Why they were filtered

## Verification Checklist

After redeploy, verify:

- [ ] `/api/ai-news?nocache=1` returns articles OR shows debug info
- [ ] If articles returned, verify they're from allowed domains
- [ ] If articles returned, verify no stock quote pages
- [ ] If empty, check `debug` field for diagnostic information
- [ ] Test 3-5 article URLs to ensure they're real articles

## Troubleshooting

**If still empty after redeploy**:

1. Check the `debug` field in the response:
   - If `query_errors` present: NewsAPI queries are failing (check API key validity)
   - If `sample_domains` present: Articles are being filtered out (domain allowlist might be too strict)
   - If `total_fetched: 0`: NewsAPI is not returning any articles (check API key, rate limits)

2. Check Vercel logs:
   - Look for `[AI News]` log messages
   - Check for NewsAPI error messages
   - Verify NEWS_API_KEY is accessible

3. Test NewsAPI directly:
   ```bash
   curl "https://newsapi.org/v2/top-headlines?category=technology&country=us&apiKey=YOUR_KEY"
   ```

## Notes

- The free tier of NewsAPI has a 100 requests/day limit
- Cache TTL is 30 minutes, so expect ~48 requests/day
- The fallback to headlines ensures we always get some results if the key is valid
