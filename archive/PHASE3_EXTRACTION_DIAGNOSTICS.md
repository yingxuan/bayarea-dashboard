# PHASE 3 - EXTRACTION DIAGNOSTICS REPORT

**Test Date:** 2026-01-01 05:12 UTC  
**API Endpoint:** https://bayarea-dashboard.vercel.app/api/market?nocache=1  
**Deployment:** ced85464 (with observability features)

---

## CACHE BYPASS: ✅ WORKING

```json
{
  "cache_hit": false,
  "cache_mode": "bypass",
  "fetched_at": "2026-01-01T05:11:56.541Z",
  "cache_age_seconds": 0
}
```

**Verdict:** Cache bypass is working correctly. Fresh data is being fetched.

---

## EXTRACTION RESULTS: ❌ ALL FAILING

### SPY - FAILED

**Value:** 687.01 (fallback)  
**Source:** finance.yahoo.com  
**Extraction Method:** fallback  
**Validation Passed:** false

**Raw Snippet:**
```
Discovery: Surprisingly High Merger Price Alters Shareholder Value for Both ... PFFA Virtus InfraCap...
```

**Problem:** Google CSE returned irrelevant snippet about a merger, not SPY price. The snippet doesn't contain "SPY" or any price in the $400-$800 range.

**Root Cause:** Google CSE query `'SPY stock price today site:finance.yahoo.com'` is returning wrong page or snippet.

---

### GOLD - FAILED

**Value:** 2650 (fallback)  
**Source:** finance.yahoo.com  
**Extraction Method:** fallback  
**Validation Passed:** false

**Raw Snippet:**
```
Find the latest Gold Feb 26 (GC=F) stock quote, history, news and other vital information to help you with your stock trading and investing.
```

**Problem:** Snippet is a generic description/meta tag, not actual price data. Contains "Feb 26" (contract month) but no price.

**Root Cause:** Google CSE is returning the page description instead of content with actual prices.

---

### BITCOIN - FAILED

**Value:** 95000 (fallback)  
**Source:** finance.yahoo.com  
**Extraction Method:** fallback  
**Validation Passed:** false

**Raw Snippet:**
```
Find the live Bitcoin USD (BTC-USD) price, history, news and other vital information to help with your cryptocurrency trading and investing.
```

**Problem:** Snippet is a generic description/meta tag, not actual price data.

**Root Cause:** Same as Gold - Google CSE returning page descriptions instead of content.

---

## ROOT CAUSE ANALYSIS

### The Real Problem

**Google Custom Search Engine (CSE) is NOT returning page content.** It's returning:
1. Meta descriptions (generic page summaries)
2. Unrelated snippets from other articles
3. Navigation text or boilerplate content

**Why This Happens:**
- Google CSE is designed for **general web search**, not **data extraction**
- Snippets are optimized for human readability, not machine parsing
- Financial data pages (Yahoo Finance) have dynamic content loaded via JavaScript
- Google CSE may not execute JavaScript or access real-time data

### Why Previous Testing Showed "500" and "26"

Those were **lucky accidents** where:
- "500" came from "S&P 500" text in a snippet
- "26" came from "Feb 26" contract date
- These matched our naive `extractNumber()` regex

**The extraction logic was never actually working.** We were just extracting random numbers from unrelated text.

---

## FUNDAMENTAL DESIGN FLAW CONFIRMED

**Google CSE cannot reliably extract real-time financial data** because:

1. ❌ Snippets don't contain actual prices
2. ❌ Snippets are meta descriptions, not live content
3. ❌ JavaScript-rendered content not included
4. ❌ No guarantee snippet contains target data
5. ❌ Snippet format varies by page structure

---

## CORRECT SOLUTION (REQUIRED)

### Option 1: Direct Page Scraping (RECOMMENDED)

Instead of using Google CSE snippets, **fetch and parse the actual Yahoo Finance pages:**

```typescript
async function fetchSPY(): Promise<MarketDataItem> {
  // Fetch the actual page
  const response = await fetch('https://finance.yahoo.com/quote/SPY/');
  const html = await response.text();
  
  // Parse HTML to find price
  // Yahoo Finance has structured JSON in <script> tags
  const jsonMatch = html.match(/root\.App\.main = ({.*?});/);
  if (jsonMatch) {
    const data = JSON.parse(jsonMatch[1]);
    const price = data.context.dispatcher.stores.QuoteSummaryStore.price.regularMarketPrice.raw;
    return { value: price, ... };
  }
}
```

**Benefits:**
- ✅ Access to actual page content
- ✅ Can parse structured data (JSON-LD, meta tags, scripts)
- ✅ Real-time prices
- ✅ Reliable

**Drawbacks:**
- Requires HTML parsing
- May break if Yahoo Finance changes page structure
- Need to handle rate limiting

---

### Option 2: Use Financial Data APIs

**Replace Google CSE entirely with proper APIs:**

- **Yahoo Finance API (unofficial):** `https://query1.finance.yahoo.com/v8/finance/chart/SPY`
  - Issue: Rate limited (we tested this earlier)
  
- **Alpha Vantage API:** Free tier available
  - `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=YOUR_KEY`
  
- **Finnhub API:** Free tier available
  - `https://finnhub.io/api/v1/quote?symbol=SPY&token=YOUR_KEY`

- **CoinGecko API (for Bitcoin):** Free, no key required
  - `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`

**Benefits:**
- ✅ Structured JSON responses
- ✅ Guaranteed field names
- ✅ Real-time data
- ✅ Reliable
- ✅ No regex extraction needed

**Drawbacks:**
- Requires API keys (except CoinGecko)
- Rate limits
- May require paid tiers for production

---

### Option 3: Keep Google CSE but Use Different Queries

**Try queries that return actual content snippets:**

Instead of:
```typescript
'SPY stock price today site:finance.yahoo.com'
```

Try:
```typescript
'SPY price $' // More likely to return content with prices
'SPY quote' // May return snippets with actual quotes
```

**Benefits:**
- ✅ No code changes to fetching logic
- ✅ Still uses existing Google CSE setup

**Drawbacks:**
- ❌ Still unreliable (snippets are unpredictable)
- ❌ May return unrelated content
- ❌ No guarantee of improvement

---

## RECOMMENDATION

**IMMEDIATE ACTION:**

1. **For Bitcoin:** Switch to CoinGecko API (free, no key, reliable)
   ```typescript
   const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
   const data = await response.json();
   const price = data.bitcoin.usd;
   ```

2. **For SPY & Gold:** Implement direct Yahoo Finance page scraping
   - Parse HTML to find structured JSON data
   - Extract prices from `<script>` tags or meta tags

3. **For Powerball:** Scrape powerball.com directly (required by user)
   - Parse HTML to find jackpot amount

4. **For Mortgage:** Keep Google CSE but improve query
   - OR scrape Bankrate.com directly

---

## NEXT STEPS

**Phase 4: Implement Direct Scraping**
1. Write HTML parser for Yahoo Finance pages
2. Test with live pages to verify data extraction
3. Add error handling for parsing failures
4. Deploy and validate with ?nocache=1

**Phase 5: Validate Accuracy**
1. Compare extracted values with actual page values
2. Verify all values within ±5% tolerance
3. Confirm source URLs are correct and clickable

---

## EVIDENCE FILES

- `/home/ubuntu/bayarea-dashboard/api-test-nocache-v2.json` - Full API response with debug fields
- `/home/ubuntu/bayarea-dashboard/PHASE1_LIVE_TEST_REPORT.md` - Initial live site testing
- `/home/ubuntu/bayarea-dashboard/PHASE2_ROOT_CAUSE_ANALYSIS.md` - Extraction logic analysis

---

## CONCLUSION

**The extraction logic improvements (Phase 3) were correct in theory but cannot work in practice** because Google CSE doesn't provide the data we need.

**We must switch to direct page scraping or proper APIs** to get accurate real-time financial data.
