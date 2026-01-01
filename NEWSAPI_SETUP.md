# NewsAPI.org Setup Guide

## ✅ API Key Obtained

Your NewsAPI.org API key: `69a5980d447347be889e36323c222d9e`

## 🚀 Add to Vercel Environment Variables

1. Go to your Vercel project dashboard: https://vercel.com/dashboard
2. Select the `bayarea-dashboard` project
3. Click **Settings** in the top navigation
4. Click **Environment Variables** in the left sidebar
5. Click **Add New** button
6. Fill in:
   - **Key:** `NEWS_API_KEY`
   - **Value:** `69a5980d447347be889e36323c222d9e`
   - **Environments:** Check all (Production, Preview, Development)
7. Click **Save**
8. **Redeploy** the project for changes to take effect:
   - Go to **Deployments** tab
   - Click the ⋯ menu on the latest deployment
   - Click **Redeploy**

## ✅ Verification

After redeploying, test the news API:

```bash
curl https://bayarea-dashboard.vercel.app/api/ai-news?nocache=1
```

You should see 5 recent tech news articles with:
- Title
- URL
- Source name
- Chinese summary
- "Why it matters" explanation

## 📊 API Limits

**Free Tier:**
- 100 requests per day
- 1 request per second
- No credit card required

**Current Usage:**
- Cache TTL: 30 minutes
- Expected daily requests: ~48 (one request every 30 minutes)
- Well within free tier limits ✅

## 🔧 Troubleshooting

If news section shows "NEWS_API_KEY not configured":
1. Verify the environment variable is added in Vercel
2. Redeploy the project
3. Wait 1-2 minutes for deployment to complete
4. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

If news section is empty:
1. Check API key is valid at https://newsapi.org/account
2. Verify you haven't exceeded daily request limit (100/day)
3. Check browser console for error messages
