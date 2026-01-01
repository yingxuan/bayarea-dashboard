# API TESTING EVIDENCE

## Test 1: Cache Bypass Request

**URL:** `https://bayarea-dashboard.vercel.app/api/market?nocache=1`  
**Timestamp:** 2026-01-01 05:11:56 UTC  
**Purpose:** Fetch fresh data, bypass cache

### Response Metadata
```json
{
  "cache_hit": false,
  "cache_mode": "bypass",
  "fetched_at": "2026-01-01T05:11:56.541Z",
  "cache_age_seconds": 0,
  "cache_expires_in_seconds": 600,
  "cache_key": "market_data"
}
```

### SPY Data
```json
{
  "name": "SPY",
  "value": 687.01,
  "unit": "USD",
  "source_name": "finance.yahoo.com",
  "source_url": "https://finance.yahoo.com/quote/SPY/",
  "as_of": "2026-01-01T05:11:56.223Z",
  "debug": {
    "extraction_method": "fallback",
    "raw_snippet": "Discovery: Surprisingly High Merger Price Alters Shareholder Value for Both ... PFFA Virtus InfraCap...",
    "extracted_value": "null (used fallback)",
    "validation_passed": false
  }
}
```

### Gold Data
```json
{
  "name": "Gold",
  "value": 2650,
  "unit": "USD/oz",
  "source_name": "finance.yahoo.com",
  "source_url": "https://finance.yahoo.com/quote/GC=F/",
  "as_of": "2026-01-01T05:11:56.674Z",
  "debug": {
    "extraction_method": "fallback",
    "raw_snippet": "Find the latest Gold Feb 26 (GC=F) stock quote, history, news and other vital information to help you with your stock trading and investing.",
    "extracted_value": "null (used fallback)",
    "validation_passed": false
  }
}
```

### Bitcoin Data
```json
{
  "name": "BTC",
  "value": 95000,
  "unit": "USD",
  "source_name": "finance.yahoo.com",
  "source_url": "https://finance.yahoo.com/quote/BTC-USD/",
  "as_of": "2026-01-01T05:11:56.159Z",
  "debug": {
    "extraction_method": "fallback",
    "raw_snippet": "Find the live Bitcoin USD (BTC-USD) price, history, news and other vital information to help with your cryptocurrency trading and investing.",
    "extracted_value": "null (used fallback)",
    "validation_passed": false
  }
}
```

---

## Test 2: Normal Cached Request

**URL:** `https://bayarea-dashboard.vercel.app/api/market`  
**Purpose:** Verify cache metadata works for normal requests

*To be tested after cache repopulates*

---

## FINDINGS

### ✅ Observability Features Working

1. **Cache Bypass:** `?nocache=1` successfully bypasses cache
2. **Cache Metadata:** All fields present and correct
3. **Debug Fields:** extraction_method, raw_snippet, extracted_value, validation_passed all working
4. **Timestamps:** fetched_at shows exact fetch time

### ❌ Extraction Still Failing

**All 3 market items using fallback values:**
- SPY: 687.01 (fallback, not real price)
- Gold: 2650 (fallback, not real price)
- Bitcoin: 95000 (fallback, not real price)

**Root Cause:** Google CSE snippets don't contain actual prices:
- SPY snippet: Irrelevant article about mergers
- Gold snippet: Generic page description "Find the latest..."
- Bitcoin snippet: Generic page description "Find the live..."

### 🔧 Required Fix

**Must switch from Google CSE to:**
1. Direct page scraping (parse Yahoo Finance HTML)
2. OR proper financial APIs (CoinGecko, Alpha Vantage, Finnhub)

Google CSE cannot provide the data we need for accurate real-time prices.
