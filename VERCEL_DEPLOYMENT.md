# Vercel Serverless Backend Deployment

## Overview

This document explains how to deploy the Google CSE-powered serverless backend to Vercel.

## Prerequisites

1. Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed (`pnpm add -D vercel`)
3. Google CSE API credentials:
   - `GOOGLE_CSE_API_KEY`
   - `GOOGLE_CSE_ID`

## Deployment Steps

### 1. Login to Vercel

```bash
pnpm vercel login
```

### 2. Set Environment Variables

Add the Google CSE credentials as Vercel secrets:

```bash
pnpm vercel secrets add google-cse-api-key "YOUR_API_KEY_HERE"
pnpm vercel secrets add google-cse-id "YOUR_CSE_ID_HERE"
```

### 3. Deploy to Vercel

```bash
# Deploy to production
pnpm vercel --prod

# Or deploy to preview
pnpm vercel
```

### 4. Get Deployment URL

After deployment, Vercel will provide a URL like:
```
https://bayarea-dashboard.vercel.app
```

Your API endpoints will be available at:
- `https://bayarea-dashboard.vercel.app/api/market`
- `https://bayarea-dashboard.vercel.app/api/ai-news`

## API Endpoints

### GET /api/market

Returns real-time market data for:
- SPY (S&P 500 ETF)
- Gold price
- Bitcoin price
- California Jumbo Mortgage Rate
- Powerball Jackpot

**Response Format:**
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
    "gold": { ... },
    "btc": { ... },
    "mortgage": { ... },
    "powerball": { ... }
  },
  "updated_at": "12/30, 6:54 PM PT",
  "cache_hit": false
}
```

**Note**: All data values are fetched in real-time from Google CSE. The `as_of` timestamp indicates when the data was retrieved. To validate accuracy, manually check that values match the linked `source_url` at the time of the request.

### GET /api/ai-news

Returns 4-5 recent AI/Tech industry news articles.

**Response Format:**
```json
{
  "news": [
    {
      "title": "OpenAI releases GPT-5",
      "url": "https://...",
      "source_name": "techcrunch.com",
      "snippet": "...",
      "summary_zh": "OpenAI 发布 GPT-5",
      "why_it_matters_zh": "...",
      "published_at": "2025-12-30T10:00:00Z",
      "as_of": "2025-12-30T18:54:00.000Z"
    }
  ],
  "updated_at": "12/30, 6:54 PM PT",
  "cache_hit": false
}
```

**Note**: The `as_of` timestamp indicates when the news data was retrieved. The `published_at` field (if available) shows when the article was originally published.

## Caching

Both endpoints implement in-memory caching with TTL:
- `/api/market`: 10 minutes
- `/api/ai-news`: 30 minutes

If fresh data fetch fails, stale cache is returned with `stale: true` flag.

## Testing

Test the deployed APIs:

```bash
# Test market data
curl https://bayarea-dashboard.vercel.app/api/market

# Test AI news
curl https://bayarea-dashboard.vercel.app/api/ai-news
```

## Updating Frontend

After deployment, update the frontend API base URL in `client/src/lib/api.ts`:

```typescript
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://bayarea-dashboard.vercel.app'
  : 'http://localhost:3000';
```

## Monitoring

View logs and analytics in the Vercel dashboard:
https://vercel.com/dashboard

## Troubleshooting

### API returns 500 error

Check Vercel logs for error details:
```bash
pnpm vercel logs
```

### Environment variables not working

Verify secrets are set correctly:
```bash
pnpm vercel env ls
```

### CORS issues

Add CORS headers in API functions if needed (already included in the code).
