# Post-Deployment Verification Checklist

## Overview

Use this checklist to verify that your Vercel deployment is working correctly. Complete all items before considering the deployment successful.

**Deployment URL**: `_______________________________`

**Date**: `_______________________________`

---

## Phase 1: Basic Connectivity (5 minutes)

### API Endpoints

- [ ] **Test /api/market endpoint**
  ```bash
  curl https://YOUR_URL.vercel.app/api/market
  ```
  - [ ] Returns HTTP 200
  - [ ] Response is valid JSON
  - [ ] No error messages in response

- [ ] **Test /api/ai-news endpoint**
  ```bash
  curl https://YOUR_URL.vercel.app/api/ai-news
  ```
  - [ ] Returns HTTP 200
  - [ ] Response is valid JSON
  - [ ] No error messages in response

### Frontend

- [ ] **Open frontend in browser**
  - URL: `https://YOUR_URL.vercel.app`
  - [ ] Page loads without errors
  - [ ] No JavaScript errors in console (F12)
  - [ ] No CORS errors in console

---

## Phase 2: Data Structure Validation (5 minutes)

### Market Data Response

Run:
```bash
curl https://YOUR_URL.vercel.app/api/market | jq
```

- [ ] **Response contains `data` object**
- [ ] **Response contains `updated_at` string**
- [ ] **Response contains `cache_hit` boolean**

- [ ] **`data.spy` object exists with:**
  - [ ] `name` (string)
  - [ ] `value` (number)
  - [ ] `unit` (string)
  - [ ] `source_name` (string)
  - [ ] `source_url` (string, starts with https://)
  - [ ] `as_of` (string, ISO 8601 format)

- [ ] **`data.gold` object exists with all required fields**
- [ ] **`data.btc` object exists with all required fields**
- [ ] **`data.mortgage` object exists with all required fields**
- [ ] **`data.powerball` object exists with all required fields**

### AI News Response

Run:
```bash
curl https://YOUR_URL.vercel.app/api/ai-news | jq
```

- [ ] **Response contains `news` array**
- [ ] **Response contains `updated_at` string**
- [ ] **Response contains `cache_hit` boolean**
- [ ] **`news` array has 4-5 items**

- [ ] **First news item (`news[0]`) contains:**
  - [ ] `title` (string)
  - [ ] `url` (string, starts with https://)
  - [ ] `source_name` (string)
  - [ ] `snippet` (string)
  - [ ] `summary_zh` (string, Chinese text)
  - [ ] `why_it_matters_zh` (string, Chinese text)
  - [ ] `as_of` (string, ISO 8601 format)

---

## Phase 3: Timestamp Validation (2 minutes)

### Check Timestamps are Current

- [ ] **Market data `as_of` timestamp**
  - Extract: `curl https://YOUR_URL.vercel.app/api/market | jq '.data.spy.as_of'`
  - [ ] Timestamp is in ISO 8601 format (e.g., `2025-12-30T18:54:00.000Z`)
  - [ ] Timestamp is within last 60 minutes

- [ ] **News data `as_of` timestamp**
  - Extract: `curl https://YOUR_URL.vercel.app/api/ai-news | jq '.news[0].as_of'`
  - [ ] Timestamp is in ISO 8601 format
  - [ ] Timestamp is within last 60 minutes

- [ ] **`updated_at` is in PT timezone format**
  - Example: `12/30, 6:54 PM PT`

---

## Phase 4: Source URL Validation (10 minutes)

### Market Data Sources

For each data item, open the `source_url` in a browser and verify:

- [ ] **SPY (S&P 500 ETF)**
  - Source URL: `_______________________________`
  - [ ] URL opens successfully (HTTP 200, not 404/403)
  - [ ] Page displays SPY stock price
  - [ ] API value matches page value (within ±5%)
  - API value: `_______` | Page value: `_______` | Difference: `_______%`

- [ ] **Gold Price**
  - Source URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Page displays gold price in USD/oz
  - [ ] API value matches page value (within ±5%)
  - API value: `_______` | Page value: `_______` | Difference: `_______%`

- [ ] **Bitcoin (BTC)**
  - Source URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Page displays BTC price in USD
  - [ ] API value matches page value (within ±5%)
  - API value: `_______` | Page value: `_______` | Difference: `_______%`

- [ ] **CA Jumbo Mortgage Rate**
  - Source URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Page displays California mortgage rates
  - [ ] API value is reasonable (between 4% and 10%)

- [ ] **Powerball Jackpot**
  - Source URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Page displays current Powerball jackpot
  - [ ] API value is reasonable (> $20 million)

### AI News Sources

For at least 3 out of 5 news articles, open the `url` in a browser and verify:

- [ ] **Article 1**
  - URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Article is about AI/tech/big tech
  - [ ] Article is recent (published within last 48 hours)
  - [ ] Article title matches or is similar to API `title`

- [ ] **Article 2**
  - URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Article is about AI/tech/big tech
  - [ ] Article is recent (published within last 48 hours)
  - [ ] Article title matches or is similar to API `title`

- [ ] **Article 3**
  - URL: `_______________________________`
  - [ ] URL opens successfully
  - [ ] Article is about AI/tech/big tech
  - [ ] Article is recent (published within last 48 hours)
  - [ ] Article title matches or is similar to API `title`

---

## Phase 5: Cache Behavior Validation (5 minutes)

### Test Cache Hit

- [ ] **First request (cache miss)**
  ```bash
  curl https://YOUR_URL.vercel.app/api/market | jq '.cache_hit'
  ```
  - Expected: `false` (or `true` if cache already exists)
  - Actual: `_______`

- [ ] **Second request (cache hit)**
  - Wait 2 seconds, then run:
  ```bash
  curl https://YOUR_URL.vercel.app/api/market | jq '.cache_hit'
  ```
  - Expected: `true`
  - Actual: `_______`

- [ ] **Cache expiry test (optional)**
  - Wait 11 minutes after first request
  - Run: `curl https://YOUR_URL.vercel.app/api/market | jq '.cache_hit'`
  - Expected: `false` (cache expired, fresh fetch)
  - Actual: `_______`

**Note**: If cache doesn't work consistently, it's likely due to different serverless instances. This is expected with in-memory caching. Consider upgrading to Redis/KV for production.

---

## Phase 6: Security Validation (5 minutes)

### Check No Credentials in Client Code

- [ ] **Open frontend in browser**: `https://YOUR_URL.vercel.app`
- [ ] **Open DevTools (F12)**
- [ ] **Go to Sources/Debugger tab**
- [ ] **Search for "GOOGLE_CSE_API_KEY"**
  - Expected: No matches found
  - Actual: `_______`
- [ ] **Search for "GOOGLE_CSE_ID"**
  - Expected: No matches found
  - Actual: `_______`

### Check No Direct Google CSE Calls

- [ ] **Open DevTools (F12) → Network tab**
- [ ] **Refresh the page**
- [ ] **Filter by "googleapis.com"**
  - Expected: No requests to `googleapis.com/customsearch`
  - Actual: `_______`
- [ ] **Verify only requests to `/api/market` and `/api/ai-news`**
  - [ ] Requests are to your Vercel domain
  - [ ] No requests to external APIs from client

### Check CORS Headers

- [ ] **Check CORS headers in API response**
  ```bash
  curl -I https://YOUR_URL.vercel.app/api/market | grep -i "access-control"
  ```
  - [ ] `Access-Control-Allow-Origin` header is present
  - [ ] `Access-Control-Allow-Methods` header is present
  - [ ] No CORS errors in browser console

---

## Phase 7: Frontend Integration (5 minutes)

### Check Finance Module (票子模块)

- [ ] **Open frontend**: `https://YOUR_URL.vercel.app`
- [ ] **Scroll to Finance Overview section**
- [ ] **Verify data is displayed**:
  - [ ] SPY price is shown
  - [ ] Gold price is shown
  - [ ] BTC price is shown
  - [ ] CA Jumbo Mortgage rate is shown
  - [ ] Powerball jackpot is shown
- [ ] **Verify timestamp is shown**:
  - [ ] "数据更新于: [timestamp] PT" is displayed at the bottom
- [ ] **Verify source links work**:
  - [ ] Click on a source link
  - [ ] Link opens in new tab
  - [ ] Link goes to the correct source page

### Check Industry News Module (行业新闻模块)

- [ ] **Scroll to Industry News section**
- [ ] **Verify news articles are displayed**:
  - [ ] 4-5 articles are shown
  - [ ] Each article has a Chinese summary (summary_zh)
  - [ ] Each article has "为什么重要" explanation (why_it_matters_zh)
- [ ] **Verify article links work**:
  - [ ] Click on an article link
  - [ ] Link opens in new tab
  - [ ] Link goes to the correct article

### Check Error Handling

- [ ] **Temporarily break the API** (set invalid URL in `client/src/config.ts`)
- [ ] **Rebuild and refresh the page**
- [ ] **Verify error message is shown**:
  - [ ] "Failed to load finance data" or similar error message
  - [ ] Frontend does not crash or show blank screen
- [ ] **Restore the correct API URL and verify data loads again**

---

## Phase 8: Performance Validation (2 minutes)

### Check Response Times

- [ ] **First request (cold start)**
  ```bash
  time curl https://YOUR_URL.vercel.app/api/market > /dev/null
  ```
  - Expected: < 5 seconds
  - Actual: `_______` seconds

- [ ] **Second request (warm)**
  ```bash
  time curl https://YOUR_URL.vercel.app/api/market > /dev/null
  ```
  - Expected: < 2 seconds
  - Actual: `_______` seconds

- [ ] **Frontend page load**
  - Open DevTools → Network tab
  - Refresh the page
  - Check "Load" time at the bottom
  - Expected: < 5 seconds
  - Actual: `_______` seconds

---

## Phase 9: Monitoring Setup (5 minutes)

### Vercel Dashboard

- [ ] **Go to Vercel Dashboard**: https://vercel.com/dashboard
- [ ] **Select your project**
- [ ] **Check Deployments tab**:
  - [ ] Latest deployment is marked as "Ready"
  - [ ] No errors in deployment logs
- [ ] **Check Functions tab**:
  - [ ] `/api/market` function is listed
  - [ ] `/api/ai-news` function is listed
  - [ ] No errors in function logs
- [ ] **Check Analytics tab** (if available):
  - [ ] Request count is increasing
  - [ ] Response time is reasonable (< 3 seconds average)
  - [ ] Error rate is low (< 5%)

### Google CSE Quota

- [ ] **Go to Google Cloud Console**: https://console.cloud.google.com/apis/api/customsearch.googleapis.com/quotas
- [ ] **Check "Queries per day" usage**:
  - Current usage: `_______` / 10,000
  - [ ] Usage is reasonable (not approaching limit)
- [ ] **Set up quota alerts** (optional):
  - [ ] Alert at 80% usage (8,000 queries/day)
  - [ ] Alert at 90% usage (9,000 queries/day)

---

## Phase 10: Final Validation (2 minutes)

### Run Automated Validation Script

```bash
cd /home/ubuntu/bayarea-dashboard
./scripts/validate-deployment.sh https://YOUR_URL.vercel.app
```

- [ ] **Script completes without errors**
- [ ] **All tests pass (green checkmarks)**
- [ ] **Review output for any warnings**

### Summary

- [ ] **All API endpoints return HTTP 200**
- [ ] **All data structures are correct**
- [ ] **All timestamps are current and in correct format**
- [ ] **At least 80% of source URLs are accessible and show matching data**
- [ ] **Cache behavior works correctly**
- [ ] **No credentials exposed in client code**
- [ ] **No CORS errors**
- [ ] **Frontend displays data correctly**
- [ ] **Performance is acceptable (< 5 seconds cold start, < 2 seconds warm)**
- [ ] **Monitoring is set up**

---

## Issues Found

If you found any issues during verification, document them here:

| Issue | Severity | Description | Fix Applied |
|-------|----------|-------------|-------------|
| | High/Medium/Low | | |
| | High/Medium/Low | | |
| | High/Medium/Low | | |

---

## Sign-Off

- **Deployment URL**: `_______________________________`
- **Verified By**: `_______________________________`
- **Date**: `_______________________________`
- **Status**: ☐ PASS ☐ PASS WITH ISSUES ☐ FAIL

**Notes**:
```
[Add any additional notes or observations here]
```

---

## Next Steps

After completing this checklist:

1. **If all checks pass**:
   - ✅ Deployment is successful
   - ✅ Share the URL with users
   - ✅ Monitor logs and analytics for the first 24 hours
   - ✅ Consider production hardening (Redis/KV, rate limiting)

2. **If some checks fail**:
   - ⚠️ Review the issues found
   - ⚠️ Apply fixes according to `DEPLOY_NOW.md` troubleshooting section
   - ⚠️ Re-run this checklist after fixes

3. **If critical checks fail**:
   - ❌ Rollback deployment
   - ❌ Review Vercel logs for errors
   - ❌ Verify environment variables are set correctly
   - ❌ Test API endpoints locally before redeploying

---

## Reference Documents

- **Deployment Guide**: `DEPLOY_NOW.md`
- **Acceptance Criteria**: `ACCEPTANCE_CRITERIA.md`
- **Code Evidence**: `CODE_EVIDENCE.md`
- **Troubleshooting**: `VERCEL_DEPLOYMENT.md`
