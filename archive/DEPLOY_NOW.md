# Deploy to Vercel - Step-by-Step Guide

## Quick Start (5 Minutes)

This guide will walk you through deploying your Bay Area Dashboard to Vercel and verifying that the Google CSE integration works correctly.

---

## Prerequisites

Before you begin, make sure you have:

1. ✅ **Vercel Account** - Sign up at https://vercel.com (free tier is sufficient)
2. ✅ **Google CSE Credentials**:
   - `GOOGLE_CSE_API_KEY` - Your Google API key with Custom Search API enabled
   - `GOOGLE_CSE_ID` - Your Custom Search Engine ID (also called `cx` parameter)
3. ✅ **Git Repository** (optional but recommended) - GitHub, GitLab, or Bitbucket

---

## Deployment Method: Vercel Dashboard (Recommended)

### Step 1: Prepare Your Code

**Option A: Deploy from Git Repository (Recommended)**

1. Push your code to GitHub/GitLab/Bitbucket:
   ```bash
   cd /home/ubuntu/bayarea-dashboard
   git init
   git add .
   git commit -m "Initial commit - Bay Area Dashboard with Google CSE"
   git remote add origin YOUR_GIT_REPO_URL
   git push -u origin main
   ```

**Option B: Deploy from Local Files**

1. Download all files from the Manus project to your local machine
2. Keep the project structure intact (especially `api/` and `client/` directories)

### Step 2: Import Project to Vercel

1. Go to https://vercel.com/new
2. Click **"Import Project"** or **"Add New Project"**
3. Choose your Git provider (GitHub/GitLab/Bitbucket) or select **"Import from local"**
4. Select your repository or upload the project folder
5. Vercel will auto-detect the framework settings

### Step 3: Configure Build Settings

Vercel should auto-detect the settings from `vercel.json`, but verify:

- **Framework Preset**: Other (or leave blank)
- **Build Command**: `cd client && pnpm install && pnpm run build`
- **Output Directory**: `client/dist`
- **Install Command**: `pnpm install`

Click **"Deploy"** but **WAIT** - you need to set environment variables first!

### Step 4: Set Environment Variables (CRITICAL)

**Before deploying**, click **"Environment Variables"** and add:

| Name | Value | Environment |
|------|-------|-------------|
| `GOOGLE_CSE_API_KEY` | Your Google API key | Production, Preview, Development |
| `GOOGLE_CSE_ID` | Your CSE ID (cx parameter) | Production, Preview, Development |

**How to get these credentials:**

1. **GOOGLE_CSE_API_KEY**:
   - Go to https://console.cloud.google.com/apis/credentials
   - Create a new API key or use an existing one
   - Enable "Custom Search API" for this key
   - Copy the API key (starts with `AIza...`)

2. **GOOGLE_CSE_ID**:
   - Go to https://programmablesearchengine.google.com/controlpanel/all
   - Create a new search engine or select an existing one
   - Copy the "Search engine ID" (cx parameter)

### Step 5: Deploy

1. After setting environment variables, click **"Deploy"**
2. Wait 2-3 minutes for the deployment to complete
3. You'll see a success message with your deployment URL

**Your deployment URL will look like:**
```
https://bayarea-dashboard-abc123.vercel.app
```

---

## Deployment Method: Vercel CLI (Alternative)

If you prefer command-line deployment:

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
# or
pnpm add -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

Follow the prompts to authenticate.

### Step 3: Set Environment Variables

```bash
cd /home/ubuntu/bayarea-dashboard

# Add environment variables
vercel env add GOOGLE_CSE_API_KEY
# Paste your API key when prompted, select all environments

vercel env add GOOGLE_CSE_ID
# Paste your CSE ID when prompted, select all environments
```

### Step 4: Deploy

```bash
# Deploy to production
vercel --prod

# Or deploy to preview environment first
vercel
```

The CLI will output your deployment URL.

---

## Post-Deployment: Verify the Deployment

### Quick Verification (2 Minutes)

1. **Test API Endpoints**:
   ```bash
   # Replace with your actual deployment URL
   curl https://your-deployment-url.vercel.app/api/market | jq
   curl https://your-deployment-url.vercel.app/api/ai-news | jq
   ```

2. **Check for HTTP 200**:
   - Both endpoints should return HTTP 200
   - Response should contain valid JSON

3. **Open Frontend**:
   - Go to `https://your-deployment-url.vercel.app`
   - Check if the 票子模块 (Finance Overview) displays market data
   - Check if the 行业新闻模块 displays news articles

### Automated Validation (5 Minutes)

Run the validation script:

```bash
cd /home/ubuntu/bayarea-dashboard
./scripts/validate-deployment.sh https://your-deployment-url.vercel.app
```

This script will:
- ✅ Test both API endpoints
- ✅ Check response structure
- ✅ Verify timestamps are present
- ✅ Test cache behavior
- ✅ Check CORS headers
- ✅ Display source URLs for manual verification

### Manual Source Verification (10 Minutes)

**CRITICAL**: You must manually verify that data matches the source URLs.

1. **Test Market Data**:
   ```bash
   curl https://your-deployment-url.vercel.app/api/market | jq '.data.spy'
   ```
   
   Output will look like:
   ```json
   {
     "name": "SPY",
     "value": 123.45,
     "unit": "USD",
     "source_name": "finance.yahoo.com",
     "source_url": "https://finance.yahoo.com/quote/SPY",
     "as_of": "2025-12-30T18:54:00.000Z"
   }
   ```
   
   **Action**: Open `source_url` in your browser and compare:
   - Does the SPY price on Yahoo Finance match the API `value`? (within ±5%)
   - Is the `as_of` timestamp recent (within last 10 minutes)?

2. **Test AI News**:
   ```bash
   curl https://your-deployment-url.vercel.app/api/ai-news | jq '.news[0]'
   ```
   
   **Action**: Open the article `url` in your browser and verify:
   - Does the article exist?
   - Is it about AI/tech/big tech?
   - Is it recent (last 24-48 hours)?

3. **Repeat for All Data Items**:
   - Check at least 3 out of 5 market data items (SPY, Gold, BTC, Mortgage, Powerball)
   - Check at least 3 out of 5 news articles

---

## Troubleshooting

### Error: "Failed to load finance data"

**Cause**: API endpoints are not accessible or returning errors.

**Fix**:
1. Check Vercel deployment logs:
   ```bash
   vercel logs
   ```
2. Verify environment variables are set:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Ensure `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID` are present
3. Test API endpoint directly:
   ```bash
   curl https://your-deployment-url.vercel.app/api/market
   ```
4. Check for error messages in the response

### Error: "Google CSE API error: 403"

**Cause**: API key is invalid or Custom Search API is not enabled.

**Fix**:
1. Go to https://console.cloud.google.com/apis/library
2. Search for "Custom Search API"
3. Click **"Enable"**
4. Verify your API key has access to this API
5. Check API key restrictions (HTTP referrers, IP addresses)

### Error: "Google CSE API error: 429"

**Cause**: API quota exceeded (10,000 queries/day on free tier).

**Fix**:
1. Check your quota usage: https://console.cloud.google.com/apis/api/customsearch.googleapis.com/quotas
2. Increase cache TTL to reduce API calls:
   - Edit `api/market.ts`: Change `CACHE_TTL = 10 * 60 * 1000` to `20 * 60 * 1000` (20 minutes)
   - Edit `api/ai-news.ts`: Change `CACHE_TTL = 30 * 60 * 1000` to `60 * 60 * 1000` (60 minutes)
3. Upgrade to paid Google CSE plan if needed

### Error: CORS errors in browser console

**Cause**: CORS headers are not set correctly.

**Fix**:
1. Verify `vercel.json` has CORS headers configured (already done)
2. Check that API functions set CORS headers (already done in `api/market.ts` and `api/ai-news.ts`)
3. Clear browser cache and try again
4. Check browser console for specific CORS error message

### Error: Data values don't match source URLs

**Cause**: Google CSE returned outdated or incorrect data.

**Fix**:
1. Check the `as_of` timestamp - is it recent?
2. If data is stale, wait for cache to expire (10 minutes for market, 30 minutes for news)
3. Adjust Google CSE queries in `api/market.ts` to get better results:
   - Line 72-76: Update search queries
   - Line 35-37: Update regex patterns for extracting numbers
4. Consider using more specific search queries or whitelisting specific domains

### Frontend shows "Failed to load finance data" but API works

**Cause**: Frontend is not configured to use the correct API base URL.

**Fix**:
1. Check `client/src/config.ts`:
   ```typescript
   export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://bayarea-dashboard.vercel.app';
   ```
2. Update the fallback URL to your actual Vercel deployment URL
3. Or set `VITE_API_BASE_URL` in Manus project settings (if frontend is on manus.space)
4. Rebuild and redeploy

---

## Update Frontend to Use Vercel API

If your frontend is hosted on `manus.space` (not on Vercel), you need to configure it to use the Vercel API:

### Option 1: Set Environment Variable in Manus (Recommended)

1. Go to Manus project settings
2. Add environment variable:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://your-deployment-url.vercel.app`
3. Rebuild the frontend

### Option 2: Hardcode API Base URL

1. Edit `client/src/config.ts`:
   ```typescript
   export const API_BASE_URL = 'https://your-deployment-url.vercel.app';
   ```
2. Rebuild the frontend

---

## Monitoring and Maintenance

### View Logs

**Vercel Dashboard**:
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Deployments** → Select latest deployment
4. Click **Functions** tab to view logs

**Vercel CLI**:
```bash
vercel logs
vercel logs --follow  # Live tail
```

### View Analytics

Go to **Analytics** tab in Vercel Dashboard to see:
- Request count
- Response time
- Error rate
- Cache hit rate

### Monitor Google CSE Quota

1. Go to https://console.cloud.google.com/apis/api/customsearch.googleapis.com/quotas
2. Check "Queries per day" usage
3. Set up alerts if approaching limit

---

## Production Hardening (Optional)

### Upgrade to Redis/KV for Persistent Caching

**Why**: In-memory cache is lost on serverless function cold starts.

**Option A: Upstash Redis** (Recommended)
1. Go to https://vercel.com/integrations/upstash
2. Click **"Add Integration"**
3. Follow the setup wizard
4. Update `api/market.ts` and `api/ai-news.ts` to use Redis client (see `CODE_EVIDENCE.md` for example code)

**Option B: Vercel KV**
1. Go to Vercel Dashboard → Your Project → Storage
2. Click **"Create KV Database"**
3. Follow the setup wizard
4. Update API functions to use KV client

### Add Rate Limiting

To prevent abuse and quota exhaustion:

1. Install rate limiting library:
   ```bash
   pnpm add @upstash/ratelimit
   ```

2. Add rate limiting to API functions:
   ```typescript
   import { Ratelimit } from '@upstash/ratelimit';
   import { Redis } from '@upstash/redis';
   
   const ratelimit = new Ratelimit({
     redis: Redis.fromEnv(),
     limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
   });
   
   export default async function handler(req, res) {
     const identifier = req.headers['x-forwarded-for'] || 'anonymous';
     const { success } = await ratelimit.limit(identifier);
     
     if (!success) {
       return res.status(429).json({ error: 'Too many requests' });
     }
     
     // ... rest of handler
   }
   ```

### Restrict CORS to Specific Origin

For production, restrict CORS to your frontend domain:

1. Edit `api/market.ts` and `api/ai-news.ts`:
   ```typescript
   res.setHeader('Access-Control-Allow-Origin', 'https://your-app.manus.space');
   ```

2. Or use environment variable:
   ```typescript
   res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
   ```

---

## Success Criteria

Your deployment is successful when:

- ✅ `/api/market` returns HTTP 200 with valid market data
- ✅ `/api/ai-news` returns HTTP 200 with 4-5 news articles
- ✅ All data items include `as_of` timestamps in ISO 8601 format
- ✅ All `source_url` and `url` fields are clickable and valid
- ✅ Data values match linked sources within ±5%
- ✅ Frontend displays data correctly (票子模块, 行业新闻模块)
- ✅ No Google CSE credentials visible in browser DevTools
- ✅ No CORS errors in browser console
- ✅ Cache behavior works (second request returns `cache_hit: true`)

---

## Next Steps After Successful Deployment

1. **Monitor Performance**:
   - Check Vercel Analytics for response times
   - Monitor Google CSE quota usage
   - Set up alerts for errors

2. **Optimize Queries**:
   - Adjust Google CSE queries if data extraction fails
   - Refine regex patterns for better accuracy
   - Add more authoritative sources to whitelist

3. **Production Hardening**:
   - Upgrade to Redis/KV for persistent caching
   - Add rate limiting to prevent abuse
   - Restrict CORS to specific origin

4. **User Testing**:
   - Share the deployed URL with users
   - Collect feedback on data accuracy
   - Monitor for errors and edge cases

---

## Support

For issues or questions:
- **Documentation**: See `VERCEL_DEPLOYMENT.md`, `ACCEPTANCE_CRITERIA.md`, `CODE_EVIDENCE.md`
- **Vercel Logs**: `vercel logs` or Vercel Dashboard → Functions
- **Environment Variables**: Vercel Dashboard → Settings → Environment Variables
- **API Testing**: `curl https://your-url.vercel.app/api/market | jq`
- **Validation Script**: `./scripts/validate-deployment.sh https://your-url.vercel.app`

---

## Quick Reference

### Important Files
- `vercel.json` - Vercel configuration
- `api/market.ts` - Market data endpoint
- `api/ai-news.ts` - AI news endpoint
- `client/src/config.ts` - API base URL configuration
- `scripts/validate-deployment.sh` - Validation script

### Important URLs
- Vercel Dashboard: https://vercel.com/dashboard
- Google Cloud Console: https://console.cloud.google.com
- Google CSE Control Panel: https://programmablesearchengine.google.com/controlpanel/all

### Environment Variables
- `GOOGLE_CSE_API_KEY` - Google API key (required)
- `GOOGLE_CSE_ID` - Custom Search Engine ID (required)
- `VITE_API_BASE_URL` - Frontend API base URL (optional, for manus.space frontend)

---

**Ready to deploy? Follow the steps above and you'll have your dashboard live in 5 minutes!**
