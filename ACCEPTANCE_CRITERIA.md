# Phase 2 / Ticket 6: Google CSE Integration - Acceptance Criteria

## Overview

This document defines the acceptance criteria for validating the Google CSE integration for real-time market data and AI news.

## Definition of Done

The implementation is considered complete when ALL of the following criteria are met:

### 1. API Endpoints Functional

- [ ] `/api/market` endpoint returns HTTP 200 with valid JSON
- [ ] `/api/ai-news` endpoint returns HTTP 200 with valid JSON
- [ ] Both endpoints handle errors gracefully (return stale cache or error message)
- [ ] Both endpoints implement caching with TTL (10 min for market, 30 min for news)

### 2. Data Accuracy and Source Validation

**Market Data (`/api/market`)**:
- [ ] Each data item includes all required fields: `name`, `value`, `unit`, `source_name`, `source_url`, `as_of`
- [ ] `as_of` timestamp is in ISO 8601 format with timezone
- [ ] All `source_url` links are clickable and open successfully
- [ ] **Manual Validation Required**: Open each `source_url` and verify that the `value` matches the data shown on the linked page at the time of the request (within reasonable market fluctuation)
- [ ] Timestamp `as_of` is current (within the cache TTL window)

**AI News (`/api/ai-news`)**:
- [ ] Returns 4-5 news articles
- [ ] Each article includes: `title`, `url`, `source_name`, `snippet`, `summary_zh`, `why_it_matters_zh`, `as_of`
- [ ] `as_of` timestamp is in ISO 8601 format with timezone
- [ ] All `url` links are clickable and open successfully
- [ ] **Manual Validation Required**: Open each `url` and verify that the article exists and is relevant to AI/tech/big tech
- [ ] Articles are recent (published within last 24-48 hours, check `published_at` if available)

### 3. Security and Privacy

- [ ] No Google CSE credentials (`GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID`) visible in browser DevTools
- [ ] No API keys in client-side JavaScript code
- [ ] All API calls are server-side only (Vercel serverless functions)

### 4. Frontend Integration

- [ ] Frontend successfully fetches data from `/api/market`
- [ ] Frontend successfully fetches data from `/api/ai-news`
- [ ] Frontend displays "数据更新于: [timestamp] PT" with correct timestamp
- [ ] Source links open in new tab with ExternalLink icon
- [ ] Frontend handles loading states gracefully
- [ ] Frontend handles error states gracefully (shows error message)

### 5. User Experience

- [ ] User can answer: "我今天的钱整体状态如何？" (from 票子模块 with real market data)
- [ ] User can answer: "今天哪些事会影响我的钱或工作？" (from 行业新闻 with real AI news)
- [ ] All clickable source links work and lead to authoritative sources
- [ ] Data loads within 3 seconds on first request (cold start)
- [ ] Data loads within 1 second on subsequent requests (cache hit)

## Validation Process

### Step 1: Deploy to Vercel

Follow instructions in `VERCEL_DEPLOYMENT.md`:
1. Login to Vercel: `pnpm vercel login`
2. Set environment variables in Vercel dashboard
3. Deploy: `pnpm vercel --prod`
4. Get deployment URL

### Step 2: Test API Endpoints

```bash
# Test market data
curl https://YOUR_DEPLOYMENT_URL/api/market | jq

# Test AI news
curl https://YOUR_DEPLOYMENT_URL/api/ai-news | jq
```

Verify:
- HTTP 200 response
- Valid JSON structure
- All required fields present
- `as_of` timestamps are current

### Step 3: Manual Source Validation

**For Market Data**:
1. Open the API response in browser or curl
2. For each data item (SPY, Gold, BTC, Mortgage, Powerball):
   - Click the `source_url` link
   - Verify the `value` in the API response matches the value shown on the linked page
   - Check that the `as_of` timestamp is within the last 10 minutes (cache TTL)

**For AI News**:
1. Open the API response in browser or curl
2. For each news article:
   - Click the `url` link
   - Verify the article exists and is accessible
   - Check that the article is relevant to AI/tech/big tech
   - Verify the article is recent (last 24-48 hours)

### Step 4: Frontend Validation

1. Open the deployed website in browser
2. Check the 票子模块 (Finance Overview):
   - Verify market data is displayed correctly
   - Click on source links to verify they work
   - Check that "数据更新于" timestamp is shown
3. Check the 行业新闻模块 (Industry News):
   - Verify 4-5 news articles are displayed
   - Click on article links to verify they work
   - Check that Chinese summaries and "为什么重要" are shown

### Step 5: Security Validation

1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh the page
4. Check all network requests:
   - Verify no requests to `googleapis.com/customsearch` from client
   - Verify only requests to `/api/market` and `/api/ai-news`
5. Go to Sources/Debugger tab
6. Search for "GOOGLE_CSE" in all JavaScript files:
   - Verify no API keys are present in client code

## Known Limitations

1. **Price Accuracy**: Market data values may differ slightly from the linked source due to:
   - Time delay between API fetch and manual verification
   - Different data sources showing slightly different values
   - Market volatility causing rapid price changes
   - **Acceptance Threshold**: Values should be within ±2% of the linked source

2. **News Recency**: Google CSE may return articles that are slightly older than 24 hours due to:
   - Indexing delays
   - Limited availability of very recent articles
   - **Acceptance Threshold**: Articles should be within 48 hours

3. **Source Availability**: Some source links may become unavailable due to:
   - Paywalls
   - Geo-restrictions
   - Site maintenance
   - **Acceptance Threshold**: At least 80% of source links should be accessible

## Success Metrics

- **Data Accuracy**: 100% of data items have valid source URLs with `as_of` timestamps
- **Source Validation**: 80%+ of source URLs are accessible and show matching data
- **Security**: 0 API keys exposed in client code
- **Performance**: 95%+ of requests complete within 3 seconds
- **User Satisfaction**: Users can answer the 3 key questions in 3-5 minutes

## Rollback Criteria

If any of the following occur, rollback to previous checkpoint:
- API endpoints return 500 errors consistently (>50% of requests)
- Google CSE credentials are exposed in client code
- Frontend cannot load data (all requests fail)
- Data accuracy is <50% (values don't match sources)

## Next Steps After Validation

1. **If validation passes**: Mark ticket as complete, create checkpoint
2. **If validation fails**: Debug issues, adjust Google CSE queries, retry validation
3. **If Google CSE is insufficient**: Consider alternative data sources or hybrid approach
