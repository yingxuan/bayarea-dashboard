# Phase 2 / Ticket 6: Google CSE Integration - Acceptance Criteria

## Overview

This document defines the acceptance criteria for validating the Google CSE integration for real-time market data and AI news. The criteria focus on **structural correctness**, **source validity**, and **security**, not on specific price values.

## Definition of Done

The implementation is considered complete when ALL of the following criteria are met:

### 1. API Endpoints Functional

**Market Data Endpoint (`/api/market`)**:
- Returns HTTP 200 with valid JSON structure
- Includes `data` object with 5 items: `spy`, `gold`, `btc`, `mortgage`, `powerball`
- Each item has required fields: `name`, `value`, `unit`, `source_name`, `source_url`, `as_of`
- Returns `updated_at` timestamp in PT timezone format
- Returns `cache_hit` boolean flag

**AI News Endpoint (`/api/ai-news`)**:
- Returns HTTP 200 with valid JSON structure
- Includes `news` array with 4-5 items
- Each item has required fields: `title`, `url`, `source_name`, `snippet`, `summary_zh`, `why_it_matters_zh`, `as_of`
- Returns `updated_at` timestamp in PT timezone format
- Returns `cache_hit` boolean flag

### 2. Timestamp Validation

**All Data Items**:
- `as_of` field is present and non-empty
- `as_of` is in ISO 8601 format with timezone (e.g., `2025-12-30T18:54:00.000Z`)
- `as_of` timestamp is current (within the last 60 minutes on first request)
- `updated_at` is in human-readable PT timezone format (e.g., `12/30, 6:54 PM PT`)

### 3. Source URL Validation

**Market Data Sources**:
- Each `source_url` is a valid, clickable HTTPS URL
- Each `source_url` opens successfully in a browser (HTTP 200, no 404/403 errors)
- Each `source_url` points to an authoritative financial data source (e.g., Yahoo Finance, Kitco, CoinMarketCap, Bankrate, Powerball.com)
- **Spot Check**: Open 3-5 random `source_url` links and verify that the page displays market data relevant to the item name

**AI News Sources**:
- Each `url` is a valid, clickable HTTPS URL
- Each `url` opens successfully in a browser (HTTP 200, no 404/403 errors)
- Each `url` points to a tech/AI news source (e.g., TechCrunch, The Verge, Reuters, Bloomberg)
- **Spot Check**: Open 3-5 random `url` links and verify that the article is about AI/tech/big tech

### 4. Data Accuracy (Spot Check)

**Market Data**:
- Open the `source_url` for **SPY** and compare the displayed price with the API `value`
- Values should be within **±5%** of each other (accounting for timing differences and market volatility)
- If values differ by more than 5%, check the `as_of` timestamp to see if data is stale

**AI News**:
- Open the `url` for **2-3 news articles** and verify that:
  - The article title matches or is similar to the API `title`
  - The article content is relevant to AI/tech/big tech
  - The article is recent (published within the last 48 hours, if `published_at` is available)

**Note**: Exact price matching is NOT required. The goal is to verify that the API is fetching real data from authoritative sources, not fabricated data.

### 5. Caching Behavior

**Cache Hit**:
- Make 2 consecutive requests to `/api/market` within 10 minutes
- Second request should return `cache_hit: true`
- `as_of` timestamp should be the same for both requests

**Cache Expiry**:
- Wait 11 minutes after the first request
- Make a third request to `/api/market`
- Third request should return `cache_hit: false`
- `as_of` timestamp should be updated

**Stale-While-Revalidate** (optional, requires simulating Google CSE failure):
- Temporarily break the Google CSE API (e.g., set invalid API key)
- Make a request to `/api/market`
- If cache exists, API should return stale data with `stale: true` flag
- If no cache exists, API should return HTTP 500 with error message

### 6. Security Validation

**No Credentials in Client Code**:
- Open browser DevTools (F12) on the frontend
- Go to **Sources** or **Debugger** tab
- Search for `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID` in all JavaScript files
- **Result**: No matches found (credentials are server-side only)

**No Direct Google CSE Calls from Client**:
- Open browser DevTools (F12) on the frontend
- Go to **Network** tab and refresh the page
- Filter requests by domain: `googleapis.com`
- **Result**: No requests to `googleapis.com/customsearch` from client
- **Result**: Only requests to `/api/market` and `/api/ai-news` on your Vercel domain

**CORS Headers**:
- Check API response headers in browser DevTools
- Verify `Access-Control-Allow-Origin` is set (either `*` or `https://your-app.manus.space`)
- Verify no CORS errors in browser console

### 7. Error Handling

**Invalid API Key**:
- Temporarily set invalid `GOOGLE_CSE_API_KEY` in Vercel environment variables
- Make a request to `/api/market`
- **Result**: HTTP 500 with error message, or stale cache if available

**Network Timeout**:
- Simulate slow network (e.g., using browser DevTools throttling)
- Make a request to `/api/market`
- **Result**: Request completes within 30 seconds (Vercel function timeout), or returns stale cache

**Missing Environment Variables**:
- Temporarily remove `GOOGLE_CSE_API_KEY` from Vercel environment variables
- Make a request to `/api/market`
- **Result**: HTTP 500 with error message indicating missing credentials

### 8. Frontend Integration

**Data Display**:
- Open the deployed frontend on `manus.space`
- Check the **票子模块 (Finance Overview)**:
  - Market data is displayed correctly (SPY, Gold, BTC, Mortgage, Powerball)
  - "数据更新于: [timestamp] PT" is shown at the bottom
  - Source links are clickable and open in new tab
- Check the **行业新闻模块 (Industry News)**:
  - 4-5 news articles are displayed
  - Chinese summaries and "为什么重要" are shown
  - Article links are clickable and open in new tab

**Loading States**:
- Refresh the page and observe loading behavior
- **Result**: Loading spinner or skeleton is shown while fetching data
- **Result**: Data appears within 3 seconds on first load (cold start)
- **Result**: Data appears within 1 second on subsequent loads (cache hit)

**Error States**:
- Temporarily break the API (e.g., set invalid Vercel URL in frontend)
- Refresh the page
- **Result**: Error message is shown (e.g., "Failed to load finance data")
- **Result**: Frontend does not crash or show blank screen

## Validation Process

### Step 1: Deploy to Vercel

Follow the instructions in `VERCEL_DEPLOYMENT.md`:
1. Set environment variables in Vercel Dashboard: `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID`
2. Deploy via Vercel Dashboard or CLI
3. Get the deployment URL (e.g., `https://bayarea-dashboard.vercel.app`)

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

### Step 3: Validate Source URLs

**For Market Data**:
1. Copy the API response to a text editor
2. For each data item (SPY, Gold, BTC, Mortgage, Powerball):
   - Copy the `source_url` value
   - Open it in a browser
   - Verify the page loads successfully (HTTP 200)
   - Verify the page displays financial data relevant to the item name
   - **Spot Check**: Compare the API `value` with the value shown on the page (should be within ±5%)

**For AI News**:
1. Copy the API response to a text editor
2. For each news article (at least 3 out of 5):
   - Copy the `url` value
   - Open it in a browser
   - Verify the page loads successfully (HTTP 200)
   - Verify the article is about AI/tech/big tech
   - Verify the article is recent (last 48 hours if possible)

### Step 4: Validate Caching

```bash
# First request (cache miss)
curl https://YOUR_DEPLOYMENT_URL/api/market | jq '.cache_hit'
# Expected: false

# Second request (cache hit)
curl https://YOUR_DEPLOYMENT_URL/api/market | jq '.cache_hit'
# Expected: true

# Wait 11 minutes, then third request (cache expired)
sleep 660
curl https://YOUR_DEPLOYMENT_URL/api/market | jq '.cache_hit'
# Expected: false
```

### Step 5: Validate Security

1. Open the deployed frontend in browser
2. Open DevTools (F12)
3. Go to **Network** tab and refresh the page
4. Verify:
   - No requests to `googleapis.com/customsearch`
   - Only requests to `/api/market` and `/api/ai-news`
5. Go to **Sources** tab
6. Search for "GOOGLE_CSE" in all files
7. Verify:
   - No matches found (no API keys in client code)

### Step 6: Validate Frontend Integration

1. Open the deployed frontend on `manus.space`
2. Check the **票子模块**:
   - Market data is displayed
   - Timestamp is shown
   - Source links work
3. Check the **行业新闻模块**:
   - News articles are displayed
   - Chinese summaries are shown
   - Article links work
4. Test error handling:
   - Temporarily break the API URL in frontend config
   - Refresh the page
   - Verify error message is shown

## Known Limitations and Acceptable Variances

### Price Accuracy

Market data values may differ from the linked source due to:
- **Timing differences**: API fetches data at time T, manual verification happens at time T+N
- **Data source differences**: Different sources may show slightly different values
- **Market volatility**: Prices change rapidly during trading hours

**Acceptance Threshold**: Values should be within **±5%** of the linked source. If the difference is larger, check the `as_of` timestamp to see if data is stale.

### News Recency

News articles may be older than 24 hours due to:
- **Google CSE indexing delays**: New articles may not appear in search results immediately
- **Limited availability**: Not all news sources publish frequently

**Acceptance Threshold**: Articles should be within **48 hours** of the current time. If older, verify that the articles are still relevant and authoritative.

### Source Availability

Some source URLs may be inaccessible due to:
- **Paywalls**: Some news sites require subscriptions
- **Geo-restrictions**: Some sites block access from certain countries
- **Site maintenance**: Temporary downtime

**Acceptance Threshold**: At least **80%** of source URLs should be accessible (HTTP 200). If a source is consistently unavailable, consider adding it to a blacklist in the API code.

### Cache Behavior

Cache hit rate may vary due to:
- **Vercel cold starts**: Serverless functions may restart, clearing in-memory cache
- **Multiple instances**: Different requests may hit different function instances with separate caches

**Acceptance Threshold**: Cache should work correctly within a single instance. For production, consider upgrading to Redis/KV for persistent caching.

## Success Metrics

- **API Availability**: 99%+ uptime (check Vercel Analytics)
- **Response Time**: <3 seconds for cold start, <1 second for cache hit
- **Data Accuracy**: 80%+ of values match linked sources within ±5%
- **Source Validity**: 80%+ of source URLs are accessible (HTTP 200)
- **Security**: 0 API keys exposed in client code
- **User Satisfaction**: Users can answer the 3 key questions in 3-5 minutes

## Rollback Criteria

Rollback to previous checkpoint if:
- API endpoints return HTTP 500 errors consistently (>50% of requests)
- Google CSE credentials are exposed in client code (security breach)
- Frontend cannot load data (all API requests fail)
- Data accuracy is <50% (values don't match sources)
- Source URLs are invalid (>50% return 404/403 errors)

## Next Steps After Validation

1. **If validation passes**: Mark ticket as complete, create final checkpoint
2. **If validation fails**: Debug issues, adjust Google CSE queries or regex patterns, retry validation
3. **If Google CSE is insufficient**: Consider alternative data sources (e.g., direct API integrations) or hybrid approach
4. **Production hardening**: Upgrade to Redis/KV for persistent caching, add rate limiting, improve error handling
