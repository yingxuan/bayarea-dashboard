# Google CSE Implementation Summary

## Phase 2 / Ticket 6: Real-Time Market Data via Google Custom Search Engine

### Implementation Status: ✅ Complete (Pending Deployment)

---

## Architecture Overview

### Serverless Backend (Vercel Functions)

Two serverless API endpoints have been implemented:

1. **`/api/market`** - Real-time market data
2. **`/api/ai-news`** - AI/Tech industry news (last 24 hours)

Both endpoints:
- Call Google CSE server-side only (API credentials never exposed to client)
- Implement in-memory caching with TTL
- Support stale-while-revalidate fallback
- Return structured JSON with clickable source URLs

---

## API Endpoints

### 1. `/api/market`

**Purpose**: Fetch real-time market data via Google CSE

**Data Items**:
- SPY (S&P 500 ETF)
- Gold price
- Bitcoin (BTC) price
- California Jumbo Mortgage Rate
- Powerball Jackpot

**Response Format**:
```json
{
  "success": true,
  "data": {
    "spy": {
      "name": "SPY",
      "value": 123.45,
      "change": 1.23,
      "change_percent": 1.01,
      "unit": "USD",
      "source_name": "Yahoo Finance",
      "source_url": "https://finance.yahoo.com/quote/SPY",
      "as_of": "2025-12-30T10:35:00-08:00"
    },
    "gold": {
      "name": "Gold",
      "value": 1234.56,
      "change": 12.30,
      "change_percent": 1.00,
      "unit": "USD",
      "source_name": "Kitco",
      "source_url": "https://www.kitco.com/...",
      "as_of": "2025-12-30T10:35:00-08:00"
    },
    // ... btc, mortgage, powerball
  },
  "updated_at": "12/30, 10:35 AM PT",
  "cache_hit": false
}
```

**Google CSE Queries**:
- `"SPY price today"`
- `"gold price today USD"`
- `"bitcoin price USD"`
- `"california jumbo mortgage rate today"`
- `"powerball jackpot today"`

**Parsing Logic**:
- Extract numeric values using regex patterns
- Identify authoritative sources (Yahoo Finance, CNBC, Reuters, official sites)
- Calculate change/change_percent when available
- Fallback to cached data if fetch fails

**Caching**:
- TTL: 5 minutes
- Stale-while-revalidate: 10 minutes
- Cache key: `market_data`

---

### 2. `/api/ai-news`

**Purpose**: Fetch today's AI/Tech industry news via Google CSE

**Response Format**:
```json
{
  "success": true,
  "news": [
    {
      "title": "OpenAI releases GPT-5 with breakthrough capabilities",
      "summary_zh": "OpenAI 发布 GPT-5，性能大幅提升",
      "why_it_matters_zh": "可能影响 AI 工程师薪资水平和就业市场需求",
      "url": "https://techcrunch.com/...",
      "source": "TechCrunch",
      "published_at": "2025-12-30T10:00:00Z",
      "tags": ["AI", "OpenAI"],
      "relevanceScore": 95
    }
    // ... 3-4 more articles
  ],
  "updated_at": "12/30, 10:35 AM PT",
  "cache_hit": false
}
```

**Google CSE Queries**:
- `"AI news today site:techcrunch.com OR site:theverge.com OR site:reuters.com"`
- `"OpenAI news today"`
- `"tech layoffs today"`
- `"NVIDIA news today"`
- `"Google AI news today"`

**Filtering Rules**:
- Must be published within last 24 hours
- Must match whitelist topics: AI, chips, cloud, big tech, earnings, layoffs, hiring, regulation
- Exclude: politics, war, social news
- Return top 4-5 articles by relevance score

**Caching**:
- TTL: 30 minutes
- Stale-while-revalidate: 60 minutes
- Cache key: `ai_news`

---

## Frontend Integration

### Updated Components

1. **`FinanceOverview.tsx`**
   - Fetches from `/api/market`
   - Displays real-time data with clickable source links
   - Shows "数据更新于: [timestamp] PT"
   - Includes ExternalLink icon for sources

2. **`Home.tsx`**
   - Fetches from `/api/ai-news`
   - Updates industry news section
   - Auto-refreshes every 30 minutes

3. **`config.ts`**
   - Centralized API base URL configuration
   - Supports local development and production

---

## File Structure

```
bayarea-dashboard/
├── api/
│   ├── market.ts          # Serverless function for market data
│   └── ai-news.ts         # Serverless function for AI news
├── client/
│   └── src/
│       ├── config.ts      # API configuration
│       ├── components/
│       │   └── FinanceOverview.tsx  # Updated to use /api/market
│       └── pages/
│           └── Home.tsx   # Updated to use /api/ai-news
├── vercel.json            # Vercel deployment config
├── VERCEL_DEPLOYMENT.md   # Deployment instructions
└── GOOGLE_CSE_IMPLEMENTATION.md  # This file
```

---

## Deployment Instructions

### Prerequisites

1. Vercel account
2. Google CSE credentials (already provided):
   - `GOOGLE_CSE_API_KEY`
   - `GOOGLE_CSE_ID`

### Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from project root**:
   ```bash
   cd /home/ubuntu/bayarea-dashboard
   vercel
   ```

4. **Set environment variables** in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add:
     - `GOOGLE_CSE_API_KEY` = [your key]
     - `GOOGLE_CSE_ID` = [your cx]

5. **Redeploy** to apply environment variables:
   ```bash
   vercel --prod
   ```

6. **Update frontend API URL** (if needed):
   - Set `VITE_API_BASE_URL` to your Vercel deployment URL
   - Or update `client/src/config.ts` directly

---

## Testing Checklist

After deployment, verify:

- [ ] `/api/market` returns real data with clickable sources
- [ ] Each market data item includes `as_of` timestamp
- [ ] Values match the linked source page at request time (manually verify)
- [ ] All market data items have valid `source_url` that opens successfully
- [ ] `/api/ai-news` returns 4-5 recent articles
- [ ] All news articles have clickable URLs that open successfully
- [ ] News articles are from last 24 hours (check `published_at`)
- [ ] Frontend displays "数据更新于: [timestamp] PT"
- [ ] Source links open in new tab with ExternalLink icon
- [ ] No Google CSE credentials visible in browser DevTools

---

## API Response Examples

### Example: `/api/market` Response

```json
{
  "success": true,
  "data": {
    "spy": {
      "name": "SPY",
      "value": 123.45,
      "change": 1.23,
      "change_percent": 1.01,
      "unit": "USD",
      "source_name": "Yahoo Finance",
      "source_url": "https://finance.yahoo.com/quote/SPY",
      "as_of": "2025-12-30T10:35:00-08:00"
    },
    "gold": {
      "name": "Gold",
      "value": 1234.56,
      "unit": "USD/oz",
      "source_name": "Kitco",
      "source_url": "https://www.kitco.com/gold-price-today-usa/",
      "as_of": "2025-12-30T10:35:00-08:00"
    },
    "btc": {
      "name": "Bitcoin",
      "value": 12345.67,
      "unit": "USD",
      "source_name": "CoinMarketCap",
      "source_url": "https://coinmarketcap.com/currencies/bitcoin/",
      "as_of": "2025-12-30T10:35:00-08:00"
    },
    "mortgage": {
      "name": "CA Jumbo 7/1 ARM",
      "value": 6.875,
      "unit": "%",
      "source_name": "Bankrate",
      "source_url": "https://www.bankrate.com/mortgages/mortgage-rates/california/",
      "as_of": "2025-12-30T10:35:00-08:00"
    },
    "powerball": {
      "name": "Powerball Jackpot",
      "value": 123000000,
      "unit": "USD",
      "source_name": "Powerball Official",
      "source_url": "https://www.powerball.com/",
      "as_of": "2025-12-30T10:35:00-08:00"
    }
  },
  "updated_at": "12/30, 10:35 AM PT",
  "cache_hit": false
}
```

### Example: `/api/ai-news` Response

```json
{
  "success": true,
  "news": [
    {
      "title": "OpenAI releases GPT-5 with breakthrough reasoning capabilities",
      "summary_zh": "OpenAI 发布 GPT-5，推理能力大幅提升",
      "why_it_matters_zh": "可能影响 AI 工程师薪资水平和就业市场需求，相关岗位需求可能增加",
      "url": "https://techcrunch.com/2025/12/30/openai-gpt5-release/",
      "source": "TechCrunch",
      "published_at": "2025-12-30T08:00:00Z",
      "tags": ["AI", "OpenAI"],
      "relevanceScore": 95
    },
    {
      "title": "NVIDIA announces next-gen Blackwell GPU architecture",
      "summary_zh": "英伟达发布下一代 Blackwell GPU 架构",
      "why_it_matters_zh": "如果你持有 NVDA 股票，这是利好消息；AI 基础设施岗位需求可能增加",
      "url": "https://www.reuters.com/technology/nvidia-blackwell-announcement-2025-12-30/",
      "source": "Reuters",
      "published_at": "2025-12-30T09:30:00Z",
      "tags": ["芯片", "NVIDIA", "AI"],
      "relevanceScore": 92
    },
    {
      "title": "Google Cloud announces major AI infrastructure expansion",
      "summary_zh": "Google Cloud 宣布大规模扩展 AI 基础设施",
      "why_it_matters_zh": "云计算和 AI 基础设施岗位需求会增加，相关技能的工程师薪资可能上涨",
      "url": "https://www.theverge.com/2025/12/30/google-cloud-ai-expansion/",
      "source": "The Verge",
      "published_at": "2025-12-30T10:00:00Z",
      "tags": ["云", "Google", "AI"],
      "relevanceScore": 88
    },
    {
      "title": "Meta reports strong Q4 earnings driven by AI ad products",
      "summary_zh": "Meta 公布强劲 Q4 财报，AI 广告产品驱动增长",
      "why_it_matters_zh": "如果你持有 META 股票，财报超预期可能带动股价上涨；AI 产品岗位需求稳定",
      "url": "https://www.cnbc.com/2025/12/30/meta-q4-earnings-ai-ads/",
      "source": "CNBC",
      "published_at": "2025-12-30T07:00:00Z",
      "tags": ["财报", "Meta", "AI"],
      "relevanceScore": 85
    }
  ],
  "updated_at": "12/30, 10:35 AM PT",
  "cache_hit": false
}
```

---

## Security Considerations

✅ **Implemented**:
- Google CSE API credentials stored as environment variables
- Server-side only API calls (never exposed to client)
- CORS properly configured
- No sensitive data in client bundle

✅ **Best Practices**:
- Use Vercel's built-in environment variable encryption
- Rotate API keys periodically
- Monitor API usage to detect anomalies
- Implement rate limiting if needed

---

## Performance Optimization

✅ **Implemented**:
- In-memory caching with TTL (5-30 minutes)
- Stale-while-revalidate pattern
- Parallel API requests where possible
- Efficient regex parsing

🔄 **Future Improvements**:
- Add Redis for distributed caching
- Implement request deduplication
- Add CDN caching headers
- Optimize Google CSE queries for speed

---

## Monitoring & Debugging

### Logs to Check

1. **Vercel Function Logs**:
   - Go to Vercel Dashboard → Project → Functions
   - Check for API errors or timeouts

2. **Browser Console**:
   - Should see: `"[FinanceOverview] Fetching market data from serverless API..."`
   - Should NOT see: Google CSE API keys or credentials

3. **Network Tab**:
   - Check `/api/market` and `/api/ai-news` responses
   - Verify `updated_at` timestamps are recent
   - Verify `source_url` fields are valid

### Common Issues

**Issue**: "Failed to load finance data"
- **Cause**: API endpoint not deployed or returning errors
- **Fix**: Check Vercel function logs, verify environment variables

**Issue**: Old/stale data
- **Cause**: Cache TTL too long or Google CSE returning old results
- **Fix**: Adjust TTL in API functions, refine CSE queries

**Issue**: Missing source URLs
- **Cause**: Parsing logic failed to extract URLs from CSE results
- **Fix**: Check CSE result format, update regex patterns

---

## Next Steps

1. **Deploy to Vercel** following instructions above
2. **Verify real data** matches current market values
3. **Test clickable links** to ensure they open valid sources
4. **Monitor API usage** to stay within Google CSE free tier limits
5. **Iterate on queries** to improve data quality and relevance

---

## Contact & Support

For deployment issues or questions:
- Check `VERCEL_DEPLOYMENT.md` for detailed deployment steps
- Review Vercel function logs for error messages
- Verify Google CSE credentials are correctly set

---

**Implementation Date**: December 30, 2025  
**Status**: ✅ Ready for Deployment  
**Next Action**: Deploy to Vercel and test with real data
