# Milestone 1: News API Fix - Implementation

## Changes Made

### 1. Switched to Top-Headlines as Primary Source
**File**: `api/ai-news.ts`

**Change**: Use `top-headlines` with `category=technology` as primary source instead of `everything` endpoint.

**Rationale**:
- `top-headlines` is guaranteed to work on NewsAPI free tier
- Returns tech news from US sources
- More reliable than `everything` which may have restrictions
- `everything` is now fallback only

**Code**:
```typescript
// Primary: top-headlines (guaranteed free tier)
const headlines = await fetchNewsAPIHeadlines('technology', 20);

// Fallback: everything endpoint (if headlines fails)
const articles = await fetchNewsAPIEverything('artificial intelligence OR AI technology', 10);
```

### 2. Expanded Domain Allowlist
**File**: `api/ai-news.ts`

**Added domains**:
- `techxplore.com` - Tech news aggregator
- `phys.org` - Science/tech news
- `science.org` - Science news
- `ieee.org` - IEEE tech publications
- `acm.org` - ACM tech publications

**Rationale**: NewsAPI's `top-headlines` with `category=technology` may return articles from these domains. Expanding allowlist ensures we don't filter out valid tech news.

## Testing

### Local Test Results
```bash
pnpm test:api
```

**Result**: ✅ All tests pass
- Market API: 10/10 checks passed
- AI News API: 5/5 checks passed (returns empty with debug when NEWS_API_KEY not configured)

### Next Steps for Full Testing

To test with actual articles, set `NEWS_API_KEY`:

```bash
# Set environment variable
$env:NEWS_API_KEY="your_key_here"

# Restart server and test
curl "http://localhost:3001/api/ai-news?nocache=1"
```

**Expected**:
- Returns 4-5 articles from technology category
- All articles from allowed domains
- No stock quote pages
- Chinese summaries present

## Acceptance Criteria Status

- [x] Code changes implemented
- [ ] `/api/ai-news?nocache=1` returns 4-5 articles (requires NEWS_API_KEY)
- [ ] All articles from allowed domains (requires NEWS_API_KEY)
- [ ] No stock quote pages (requires NEWS_API_KEY)
- [ ] All URLs clickable (requires NEWS_API_KEY)
- [ ] Chinese summaries present (requires NEWS_API_KEY)

**Note**: Full verification requires `NEWS_API_KEY` to be set. The code changes are complete and tested for error handling.

## Risk Assessment

**Low Risk** ✅:
- Configuration change only
- Fallback strategy in place
- Error handling preserved
- No breaking changes

## Files Modified

1. `api/ai-news.ts` - Switched to top-headlines primary, expanded domain allowlist
