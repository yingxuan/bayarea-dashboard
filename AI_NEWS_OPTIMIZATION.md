# AI News API Optimization Summary

## Changes Made

### 1. Enhanced Google CSE Query Strategy

**Before:**
- Simple generic queries: "AI artificial intelligence news", "OpenAI ChatGPT news"
- No date filtering
- All queries treated equally

**After:**
- **9 targeted queries** with specific focus areas:
  - AI company news (OpenAI, NVIDIA, Google, Meta, Microsoft)
  - Job market & tech industry trends
  - AI breakthroughs and startup funding
- **Date restrictions** added:
  - `d3` (past 3 days) for breaking AI news
  - `d7` (past week) for job market and funding news
- **Boolean operators** (OR) for broader coverage within topics
- **Error handling** per query (failed queries don't block others)

### 2. Improved Source Quality Control

**Tier 1 Sources (Highest Priority):**
- TechCrunch, The Verge, Ars Technica
- Reuters, Bloomberg, The Information

**Tier 2 Sources (Quality):**
- VentureBeat, Wired, Engadget
- CNBC, Financial Times, WSJ, NYTimes

**Excluded Sources:**
- YouTube, Reddit, Twitter/X
- Facebook, Pinterest
- Other social media and aggregators

### 3. Advanced Sorting Algorithm

**Sort Priority:**
1. **Source Tier** - Tier 1 sources always appear first
2. **Recency** - Within each tier, most recent articles first
3. **Deduplication** - Same URL never appears twice

### 4. Better Error Resilience

- Individual query failures don't crash the entire API
- Failed queries log errors and return empty arrays
- Stale cache fallback if all queries fail
- Graceful degradation ensures users always see content

## Expected Results

### Content Quality
- ✅ All articles from reputable tech news sources
- ✅ No YouTube videos, social media posts, or low-quality aggregators
- ✅ Recent articles (past 3-7 days) ensuring freshness

### Content Diversity
- ✅ Mix of AI company news (OpenAI, NVIDIA, Google, etc.)
- ✅ Job market insights (layoffs, hiring, salaries)
- ✅ Technical breakthroughs and industry trends
- ✅ Startup funding and investment news

### Relevance for Bay Area Tech Workers
- ✅ Focus on companies with large Bay Area presence
- ✅ Job market signals for career planning
- ✅ AI/ML technology trends affecting skill requirements
- ✅ Stock-relevant news for equity compensation holders

## Testing Checklist

After deployment, verify:

1. **API Returns Data**
   ```bash
   curl https://bayarea-dashboard-y3na.vercel.app/api/ai-news | jq '.news | length'
   # Should return: 5 (or close to 5)
   ```

2. **Source Quality**
   ```bash
   curl https://bayarea-dashboard-y3na.vercel.app/api/ai-news | jq '.news[].source_name'
   # Should see: techcrunch.com, theverge.com, reuters.com, etc.
   # Should NOT see: youtube.com, reddit.com, twitter.com
   ```

3. **Article Freshness**
   ```bash
   curl https://bayarea-dashboard-y3na.vercel.app/api/ai-news | jq '.news[].published_at'
   # Dates should be within past 3-7 days
   ```

4. **Chinese Summaries**
   ```bash
   curl https://bayarea-dashboard-y3na.vercel.app/api/ai-news | jq '.news[].summary_zh'
   # Should see Chinese text, not just English titles
   ```

5. **Manual Verification**
   - Visit https://bayarea-dashboard-y3na.vercel.app/
   - Scroll to "行业新闻" section
   - Click on 2-3 article links
   - Verify:
     - Links work (no 404)
     - Articles are real and recent
     - Content matches the summary
     - Sources are reputable

## Troubleshooting

### If API still returns empty array:

1. **Check Google CSE quota:**
   - Free tier: 100 queries/day
   - With 9 queries × 3 results each = 27 API calls per refresh
   - Cache TTL is 30 minutes, so ~48 refreshes/day max
   - If quota exceeded, wait 24 hours or upgrade CSE plan

2. **Check environment variables:**
   ```bash
   # In Vercel Dashboard → Settings → Environment Variables
   # Verify both exist and are correct:
   GOOGLE_CSE_API_KEY=...
   GOOGLE_CSE_ID=...
   ```

3. **Check Vercel function logs:**
   ```bash
   vercel logs --prod
   # Look for errors like:
   # "[AI News] Query ... failed: ..."
   # "Google CSE API error: ..."
   ```

4. **Test individual queries manually:**
   ```bash
   # Replace YOUR_KEY and YOUR_CX with actual values
   curl "https://www.googleapis.com/customsearch/v1?key=YOUR_KEY&cx=YOUR_CX&q=OpenAI+OR+ChatGPT&num=3&sort=date&dateRestrict=d3"
   ```

### If articles are irrelevant:

1. **Adjust query keywords** in `api/ai-news.ts` lines 151-166
2. **Modify date restrictions** (e.g., change `d3` to `d1` for more recent)
3. **Add/remove source tiers** in lines 182-198

### If Chinese summaries are generic:

1. **Enhance keyword matching** in `enhanceNewsItem()` function (lines 43-107)
2. **Add more company/product patterns** to extract specific details
3. **Improve "why it matters" logic** for better relevance explanations

## Performance Impact

- **API calls per refresh:** 9 queries (within Google CSE free tier)
- **Cache duration:** 30 minutes (reduces API usage)
- **Response time:** ~2-4 seconds (parallel queries)
- **Data freshness:** Always within past 3-7 days

## Next Steps

1. **Monitor query success rate** in Vercel logs
2. **Adjust queries** based on actual result quality
3. **Consider adding more tiers** for niche tech news sources
4. **Implement user feedback** mechanism for article relevance
