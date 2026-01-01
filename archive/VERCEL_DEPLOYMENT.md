# Vercel Serverless Backend Deployment Guide

## Overview

This project uses Vercel Serverless Functions to provide real-time market data and AI news via Google Custom Search Engine (CSE). The frontend is hosted on `manus.space`, while the backend API is deployed on `vercel.app`.

## Prerequisites

1. **Vercel Account**: Sign up at https://vercel.com (free tier is sufficient)
2. **Google CSE Credentials**:
   - `GOOGLE_CSE_API_KEY` - Your Google API key with Custom Search API enabled
   - `GOOGLE_CSE_ID` - Your Custom Search Engine ID (also called `cx` parameter)

## Deployment Steps

### Step 1: Install Vercel CLI (Optional)

```bash
pnpm add -D vercel
```

Or use the Vercel Dashboard for deployment (recommended for first-time users).

### Step 2: Set Environment Variables

**CRITICAL**: The code uses these exact environment variable names:
- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_ID`

You must set these variables using **one** of the following methods:

#### Method A: Vercel Dashboard (Recommended)

1. Go to https://vercel.com/dashboard
2. Select your project (or create new project by importing from Git)
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:
   - **Key**: `GOOGLE_CSE_API_KEY`, **Value**: `your_api_key_here`
   - **Key**: `GOOGLE_CSE_ID`, **Value**: `your_cse_id_here`
5. Select environments: **Production**, **Preview**, **Development**
6. Click **Save**

#### Method B: Vercel CLI

```bash
# Login to Vercel
pnpm vercel login

# Add environment variables
pnpm vercel env add GOOGLE_CSE_API_KEY
# Paste your API key when prompted

pnpm vercel env add GOOGLE_CSE_ID
# Paste your CSE ID when prompted
```

**Note**: `vercel secrets add` is deprecated and no longer works. Use `vercel env add` or the Dashboard.

### Step 3: Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/new
2. Import your Git repository (GitHub, GitLab, or Bitbucket)
3. Vercel will auto-detect the framework and settings
4. Click **Deploy**
5. Wait for deployment to complete (~2-3 minutes)

#### Option B: Deploy via CLI

```bash
# Deploy to production
pnpm vercel --prod

# Or deploy to preview environment
pnpm vercel
```

### Step 4: Get Your API Base URL

After deployment, Vercel provides a URL like:
```
https://bayarea-dashboard.vercel.app
```

Your API endpoints will be:
- `https://bayarea-dashboard.vercel.app/api/market`
- `https://bayarea-dashboard.vercel.app/api/ai-news`

### Step 5: Configure Frontend API Base URL

Since the frontend is hosted on `manus.space` and the backend on `vercel.app`, you need to configure the API base URL.

**Option A: Environment Variable (Recommended)**

Set `VITE_API_BASE_URL` in your Manus project settings:
```
VITE_API_BASE_URL=https://bayarea-dashboard.vercel.app
```

**Option B: Hardcode in Frontend**

Update `client/src/lib/api.ts` (or wherever API calls are made):
```typescript
const API_BASE_URL = 'https://bayarea-dashboard.vercel.app';
```

**IMPORTANT**: Do NOT rely on `NODE_ENV` alone for API routing, as the frontend and backend are on different domains.

## API Endpoints

### GET /api/market

Returns real-time market data for SPY, Gold, Bitcoin, CA Jumbo Mortgage Rate, and Powerball Jackpot.

**Response Structure** (values are examples only):
```json
{
  "data": {
    "spy": {
      "name": "SPY",
      "value": 123.45,
      "unit": "USD",
      "source_name": "finance.yahoo.com",
      "source_url": "https://finance.yahoo.com/quote/SPY",
      "as_of": "2025-12-30T18:54:00.000Z"
    },
    "gold": {
      "name": "Gold",
      "value": 1234.56,
      "unit": "USD/oz",
      "source_name": "kitco.com",
      "source_url": "https://www.kitco.com/gold-price-today-usa/",
      "as_of": "2025-12-30T18:54:00.000Z"
    },
    "btc": {
      "name": "BTC",
      "value": 12345.67,
      "unit": "USD",
      "source_name": "coinmarketcap.com",
      "source_url": "https://coinmarketcap.com/currencies/bitcoin/",
      "as_of": "2025-12-30T18:54:00.000Z"
    },
    "mortgage": {
      "name": "CA_JUMBO_ARM",
      "value": 0.0675,
      "unit": "rate",
      "source_name": "bankrate.com",
      "source_url": "https://www.bankrate.com/mortgages/mortgage-rates/california/",
      "as_of": "2025-12-30T18:54:00.000Z"
    },
    "powerball": {
      "name": "POWERBALL",
      "value": 123000000,
      "unit": "USD",
      "source_name": "powerball.com",
      "source_url": "https://www.powerball.com/",
      "as_of": "2025-12-30T18:54:00.000Z"
    }
  },
  "updated_at": "12/30, 6:54 PM PT",
  "cache_hit": false
}
```

**Validation**: Open each `source_url` and verify that the `value` matches the data shown on the linked page at request time.

### GET /api/ai-news

Returns 4-5 recent AI/Tech industry news articles.

**Response Structure** (content is example only):
```json
{
  "news": [
    {
      "title": "[Article title from real source]",
      "url": "https://[real-article-url]",
      "source_name": "techcrunch.com",
      "snippet": "[Article snippet]",
      "summary_zh": "[Chinese summary]",
      "why_it_matters_zh": "[Why it matters in Chinese]",
      "published_at": "2025-12-30T10:00:00Z",
      "as_of": "2025-12-30T18:54:00.000Z"
    }
  ],
  "updated_at": "12/30, 6:54 PM PT",
  "cache_hit": false
}
```

**Validation**: Open each `url` and verify that the article exists and is relevant to AI/tech/big tech.

## Caching Strategy

### Current Implementation: In-Memory Cache

Both API endpoints use **in-memory caching** with TTL:
- `/api/market`: 10 minutes TTL
- `/api/ai-news`: 30 minutes TTL

**Characteristics**:
- ✅ Simple, no external dependencies
- ✅ Works on Vercel free tier
- ⚠️ Cache is per-instance (not shared across serverless function instances)
- ⚠️ Cache is lost on cold starts

**Stale-While-Revalidate**: If fresh data fetch fails, the API returns stale cache with `stale: true` flag.

### Optional: Upgrade to Redis/KV (Production Hardening)

For production use with high traffic, consider upgrading to persistent caching:

**Option A: Upstash Redis** (Recommended)
- Free tier available (no Vercel Pro required)
- Persistent cache shared across all instances
- Setup: https://vercel.com/integrations/upstash

**Option B: Vercel KV**
- Built-in key-value store
- Free tier available (no Vercel Pro required)
- Setup: https://vercel.com/docs/storage/vercel-kv

**Implementation**: Replace in-memory `Map` with Redis/KV client in `api/market.ts` and `api/ai-news.ts`.

## CORS Configuration

Since the frontend is hosted on `manus.space` and the backend on `vercel.app`, CORS headers are required.

The API functions already include CORS headers:
```typescript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

If you need to restrict to specific origins, update to:
```typescript
res.setHeader('Access-Control-Allow-Origin', 'https://your-app.manus.space');
```

## Testing

### Test API Endpoints

```bash
# Test market data
curl https://YOUR_DEPLOYMENT_URL/api/market | jq

# Test AI news
curl https://YOUR_DEPLOYMENT_URL/api/ai-news | jq
```

### Verify Response Structure

Check that each response includes:
- ✅ `data` or `news` array with all required fields
- ✅ `as_of` timestamp in ISO 8601 format
- ✅ `source_url` or `url` that is clickable and valid
- ✅ `updated_at` timestamp in PT timezone
- ✅ `cache_hit` boolean flag

### Verify Source URLs

For each data item:
1. Copy the `source_url` from the API response
2. Open it in a browser
3. Compare the value in the API response with the value shown on the source page
4. Values should match within ±2% (accounting for market volatility and timing)

### Verify Security

1. Open browser DevTools (F12) on your frontend
2. Go to Network tab and refresh the page
3. Verify:
   - ✅ No requests to `googleapis.com/customsearch` from client
   - ✅ Only requests to your Vercel API endpoints
4. Go to Sources tab and search for "GOOGLE_CSE"
5. Verify:
   - ✅ No API keys in client-side JavaScript

## Monitoring

### View Logs

**Vercel Dashboard**:
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Deployments** → Select latest deployment
4. Click **Functions** tab to view logs

**Vercel CLI**:
```bash
pnpm vercel logs
```

### View Analytics

Go to **Analytics** tab in Vercel Dashboard to see:
- Request count
- Response time
- Error rate
- Cache hit rate

## Troubleshooting

### Error: "Failed to load finance data"

**Cause**: API endpoint is not accessible or returning errors.

**Fix**:
1. Check that environment variables are set correctly in Vercel Dashboard
2. View function logs in Vercel Dashboard
3. Test API endpoint directly with `curl`
4. Verify Google CSE API key has Custom Search API enabled
5. Check Google CSE API quota (10,000 queries/day on free tier)

### Error: "Google CSE API error: 403"

**Cause**: API key is invalid or Custom Search API is not enabled.

**Fix**:
1. Go to https://console.cloud.google.com/apis/library
2. Enable "Custom Search API"
3. Verify API key has correct permissions
4. Check API key restrictions (HTTP referrers, IP addresses)

### Error: "Google CSE API error: 429"

**Cause**: API quota exceeded (10,000 queries/day on free tier).

**Fix**:
1. Increase cache TTL to reduce API calls
2. Upgrade to paid Google CSE plan
3. Implement rate limiting on frontend

### CORS Errors

**Cause**: Frontend on `manus.space` cannot access backend on `vercel.app`.

**Fix**:
1. Verify CORS headers are set in API functions (already included)
2. Check browser console for specific CORS error message
3. Update `Access-Control-Allow-Origin` if needed

### Stale Data

**Cause**: Cache TTL is too long or cache is not being invalidated.

**Fix**:
1. Reduce `CACHE_TTL` in `api/market.ts` and `api/ai-news.ts`
2. Add manual cache invalidation endpoint (optional)
3. Upgrade to Redis/KV for better cache control

## Environment Variable Reference

| Variable Name | Required | Description | Example |
|--------------|----------|-------------|---------|
| `GOOGLE_CSE_API_KEY` | ✅ Yes | Google API key with Custom Search API enabled | `AIzaSy...` |
| `GOOGLE_CSE_ID` | ✅ Yes | Custom Search Engine ID (cx parameter) | `a1b2c3d4e5...` |
| `VITE_API_BASE_URL` | ⚠️ Recommended | Frontend API base URL (set in Manus project) | `https://bayarea-dashboard.vercel.app` |

## Security Checklist

- ✅ Google CSE credentials are only in Vercel environment variables (server-side)
- ✅ No API keys in client-side code or Git repository
- ✅ CORS headers are configured for `manus.space` origin
- ✅ API endpoints do not expose sensitive data
- ✅ Rate limiting is handled by Google CSE API quota

## Next Steps

1. **Deploy to Vercel** following the steps above
2. **Test API endpoints** with `curl` to verify responses
3. **Verify source URLs** by manually opening them and comparing values
4. **Configure frontend** to use the Vercel API base URL
5. **Monitor logs** in Vercel Dashboard for errors
6. **Optional**: Upgrade to Redis/KV for production hardening
