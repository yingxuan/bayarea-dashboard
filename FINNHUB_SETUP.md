# Finnhub API Setup Guide

## Overview

The `/api/quotes` endpoint uses Finnhub to fetch real-time stock quotes for any ticker symbol. This enables the holdings editor to support arbitrary stocks (not just SPY, GOLD, BTC).

## API Key Setup

### 1. Get Finnhub API Key

1. Visit https://finnhub.io/
2. Sign up for a free account
3. Go to your dashboard: https://finnhub.io/dashboard
4. Copy your API key (starts with `c...` or similar)

### 2. Add to Environment Variables

**Local Development (.env file):**

Add to your `.env` file:
```bash
FINNHUB_API_KEY=your_api_key_here
```

**Vercel Deployment:**

1. Go to your Vercel project dashboard
2. Select the `bayarea-dashboard` project
3. Click **Settings** → **Environment Variables**
4. Add:
   - **Key:** `FINNHUB_API_KEY`
   - **Value:** Your Finnhub API key
   - **Environments:** Production, Preview, Development
5. Click **Save**
6. **Redeploy** the project for changes to take effect

## API Limits

**Free Tier:**
- 60 API calls per minute
- 30 API calls per second
- No credit card required

**Rate Limiting:**
- The API implements concurrency limiting (max 5 concurrent requests)
- Cache TTL: 60 seconds (configurable 30-120s)
- 429 responses are handled gracefully (marked as unavailable)

## Usage

### API Endpoint

```
GET /api/quotes?tickers=AAPL,MSFT,NVDA
```

**Query Parameters:**
- `tickers` (required): Comma-separated list of ticker symbols
- `nocache=1` (optional): Bypass cache

**Response Format:**
```json
{
  "quotes": [
    {
      "ticker": "AAPL",
      "status": "ok",
      "price": 175.50,
      "prevClose": 174.20,
      "change": 1.30,
      "changePercent": 0.75,
      "asOf": "2024-01-01T12:00:00.000Z",
      "source": {
        "name": "Finnhub",
        "url": "https://finnhub.io/quote/AAPL"
      },
      "ttlSeconds": 60
    }
  ],
  "updated_at": "1/1, 12:00 PM",
  "fetched_at": "2024-01-01T12:00:00.000Z",
  "tickers_requested": ["AAPL", "MSFT", "NVDA"],
  "tickers_count": 3,
  "cache_mode": "normal"
}
```

## Verification

Test the API locally:

```bash
# Test with multiple tickers
curl "http://localhost:3001/api/quotes?tickers=AAPL,MSFT,NVDA&nocache=1"

# Test with single ticker
curl "http://localhost:3001/api/quotes?tickers=TSLA"

# Test cache bypass
curl "http://localhost:3001/api/quotes?tickers=AAPL&nocache=1"
```

## Troubleshooting

**Error: "FINNHUB_API_KEY not configured"**
- Check that the environment variable is set in `.env` (local) or Vercel dashboard (production)
- Restart the server after adding the key

**Error: Rate limited (429)**
- The API will mark the ticker as unavailable
- Wait a few seconds and try again
- Consider increasing cache TTL to reduce API calls

**No data for ticker**
- Check that the ticker symbol is correct (e.g., "AAPL" not "Apple")
- Some tickers may not be available on Finnhub
- Check the `status` field in the response: `"unavailable"` means no data
