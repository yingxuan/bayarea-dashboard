# AI News API Diagnosis & Fix

## Issue Identified

The AI News API was returning an empty array even though NewsAPI was successfully fetching articles.

## Root Cause

**All articles were being filtered out by the domain allowlist.**

Debug information revealed:
- ✅ NewsAPI is working: `total_fetched: 15` articles
- ✅ Deduplication working: `unique_after_dedup: 14` articles
- ❌ All filtered out: `filtered_out: 14` articles
- 🔍 Sample domains: `["biztoc.com", "biztoc.com", "biztoc.com"]`

**Problem**: NewsAPI was returning articles from `biztoc.com`, which was NOT in the allowed domains list.

## Fix Applied

**File**: `api/ai-news.ts`

**Change**: Expanded the `ALLOWED_DOMAINS` list to include:
- `biztoc.com` (Business news aggregator that NewsAPI commonly returns)
- Additional tech news sources: `engadget.com`, `gizmodo.com`, `zdnet.com`, `cnet.com`, `venturebeat.com`, `theinformation.com`, `axios.com`, `businessinsider.com`, `forbes.com`

## Current Allowlist

```typescript
const ALLOWED_DOMAINS = [
  'reuters.com',
  'theverge.com',
  'arstechnica.com',
  'techcrunch.com',
  'wired.com',
  'ft.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'cnbc.com',
  'biztoc.com', // ← NEWLY ADDED
  'engadget.com', // ← NEWLY ADDED
  'gizmodo.com', // ← NEWLY ADDED
  'zdnet.com', // ← NEWLY ADDED
  'cnet.com', // ← NEWLY ADDED
  'venturebeat.com', // ← NEWLY ADDED
  'theinformation.com', // ← NEWLY ADDED
  'axios.com', // ← NEWLY ADDED
  'businessinsider.com', // ← NEWLY ADDED
  'forbes.com', // ← NEWLY ADDED
];
```

## Safety Measures Still in Place

Even with the expanded allowlist, the following filters remain active:

1. **Stock Quote Filter**: Rejects URLs containing `/quote/`, `/symbol/`, or `/stock/`
2. **Finance Domain Filter**: Rejects `finance.yahoo.com` and `marketwatch.com` (unless explicitly allowed)
3. **Domain Validation**: Only allows articles from domains in the allowlist

## Next Steps

1. **Redeploy to Vercel** (required for changes to take effect)
2. **Test the endpoint**:
   ```bash
   curl "https://bayarea-dashboard.vercel.app/api/ai-news?nocache=1"
   ```
3. **Verify results**:
   - Should return 4-5 articles
   - All articles should be from allowed domains
   - No stock quote pages should be present
   - All URLs should be clickable and open real articles

## Expected Behavior After Redeploy

**Before fix**:
```json
{
  "news": [],
  "debug": {
    "total_fetched": 15,
    "filtered_out": 14,
    "sample_domains": ["biztoc.com"]
  }
}
```

**After fix** (expected):
```json
{
  "news": [
    {
      "title": "...",
      "url": "https://biztoc.com/...",
      "source_name": "biztoc.com",
      "snippet": "...",
      "summary_zh": "...",
      "why_it_matters_zh": "..."
    },
    // ... 4-5 articles
  ],
  "updated_at": "...",
  "fetched_at": "..."
}
```

## Verification Checklist

After redeploy, verify:

- [ ] `/api/ai-news?nocache=1` returns 4-5 articles
- [ ] All article URLs are from allowed domains
- [ ] No stock quote pages (`/quote/`, `/symbol/`, `/stock/`)
- [ ] All URLs are clickable and open real articles
- [ ] Chinese summaries (`summary_zh`) are present
- [ ] "Why it matters" (`why_it_matters_zh`) explanations are present

## Notes

- `biztoc.com` is a business news aggregator that NewsAPI commonly returns
- The stock quote filter will still reject any biztoc.com articles that link to stock quotes
- If biztoc.com articles are still problematic, we can remove it from the allowlist and rely on other sources
