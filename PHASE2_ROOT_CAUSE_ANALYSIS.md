# PHASE 2 - ROOT CAUSE ANALYSIS

**Analysis Date:** 2025-12-31  
**Analyst:** Manus AI Agent  
**File Analyzed:** `/home/ubuntu/bayarea-dashboard/api/market.ts`

---

## CRITICAL FINDING: EXTRACTION LOGIC IS FUNDAMENTALLY BROKEN

### Problem Summary

The `extractNumber()` function (line 38-42) is **too naive** and extracts the **first number it finds** in the snippet, regardless of context. This causes catastrophic failures:

```typescript
function extractNumber(text: string): number | null {
  // Remove commas and extract number
  const match = text.replace(/,/g, '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}
```

### Root Cause #1: SPY Extraction Failure

**Current Code (line 101):**
```typescript
const price = extractNumber(snippet) || 687.01;
```

**Why It Fails:**
- Google CSE snippet for SPY likely contains: "SPDR S&P **500** ETF (SPY) ... $681.92"
- `extractNumber()` matches the **first number**: "500" (from "S&P 500")
- Actual price ($681.92) is ignored

**Evidence from Live Site:**
- Dashboard shows: **500**
- Actual SPY price: **$681.92**
- Error: 26.7%

---

### Root Cause #2: Gold Extraction Failure

**Current Code (line 177):**
```typescript
const price = extractNumber(snippet) || 2650;
```

**Why It Fails:**
- Google CSE snippet for Gold likely contains: "Gold Feb **26** (GC=F) ... 4,332.10"
- `extractNumber()` matches the **first number**: "26" (from "Feb 26" contract date)
- Actual price ($4,332.10) is ignored

**Evidence from Live Site:**
- Dashboard shows: **26**
- Actual Gold price: **$4,332.10**
- Error: 99.4% (missing thousands digit)

---

### Root Cause #3: Bitcoin Extraction Failure

**Current Code (line 233):**
```typescript
const price = extractBitcoinPrice(snippet) || 95000;
```

**Why It Partially Works:**
- `extractBitcoinPrice()` has specialized regex patterns (lines 44-68)
- But fallback value (95000) is hardcoded and outdated
- When extraction fails, returns stale fallback instead of current price

**Evidence from Live Site:**
- Dashboard shows: **95,000**
- Actual Bitcoin price: **$87,769.38**
- Error: 8.2% (likely using fallback, not real extraction)

---

### Root Cause #4: Powerball & Mortgage Rate Fallback

**Current Code:**
- Powerball (line 371): `value: 485000000` (fallback)
- Mortgage Rate (line 271): `value: 0.069` (fallback)

**Why They Fail:**
- Google CSE queries return no results (site restrictions too narrow)
- Code immediately returns hardcoded fallback values
- Source shows "Fallback" instead of real source

**Evidence from Live Site:**
- Both show "Fallback" as source
- Values are hardcoded, not real-time

---

## FUNDAMENTAL DESIGN FLAW

### The Problem

**Google CSE snippets are NOT structured data.** They are plain text excerpts that may contain:
- Multiple numbers (dates, contract months, volumes, prices)
- Text before/after the actual price
- Different formats depending on the source page

**Current approach:**
1. Search Google CSE for a page
2. Extract snippet (plain text)
3. Use regex to find "first number"
4. Hope it's the right number ❌

**This is fundamentally unreliable.**

---

## WHY PREVIOUS FIXES DIDN'T WORK

### Previous Checkpoint: "6d8d0c71" (Dec 30, 2025)

**Claimed Fixes:**
1. "Fixed market API 'Cannot read properties of undefined' error"
2. "Added safe property access for snippet/htmlSnippet"
3. "Fixed mortgage rate display format (0.069 → 6.9%)"

**What Actually Happened:**
- ✅ Fixed crash (undefined errors)
- ✅ Fixed frontend display format (mortgage rate now shows 6.9%)
- ❌ **DID NOT FIX** extraction logic
- ❌ **DID NOT FIX** data accuracy

**Result:**
- API no longer crashes
- But returns completely wrong data
- Users see incorrect prices with "working" links

---

## CORRECT SOLUTION

### Option 1: Use Structured Data APIs (RECOMMENDED)

**Replace Google CSE with real financial data APIs:**
- **Yahoo Finance API** (unofficial but reliable)
- **Alpha Vantage API** (free tier available)
- **Finnhub API** (free tier available)
- **CoinGecko API** (for Bitcoin)

**Benefits:**
- ✅ Structured JSON responses
- ✅ Guaranteed field names (e.g., `price`, `last`, `close`)
- ✅ No regex extraction needed
- ✅ Real-time data
- ✅ Reliable

**Drawbacks:**
- Requires API keys
- May have rate limits

---

### Option 2: Improve Extraction Logic (FALLBACK)

**If we must use Google CSE, improve regex patterns:**

**For SPY:**
```typescript
// Look for price AFTER "SPY" or "$" symbol
const spyPatterns = [
  /SPY.*?\$?([\d,]+\.[\d]{2})/i,  // SPY ... $681.92
  /\$?([\d,]+\.[\d]{2}).*?SPY/i,  // $681.92 ... SPY
];
```

**For Gold:**
```typescript
// Look for 4-digit price (gold is $2000-$5000 range)
const goldPatterns = [
  /gold.*?\$?([2-5][\d]{3}\.[\d]{1,2})/i,  // gold ... $4332.10
  /\$?([2-5][\d]{3}\.[\d]{1,2}).*?gold/i,  // $4332.10 ... gold
];
```

**For Powerball:**
```typescript
// Look for millions/billions format
const powerballPatterns = [
  /\$?([\d,]+)\s*(?:million|billion)/i,  // $485 million
  /jackpot.*?\$?([\d,]+)/i,  // jackpot $485M
];
```

**Benefits:**
- ✅ Can work with existing Google CSE setup
- ✅ No new API keys needed

**Drawbacks:**
- ❌ Still fragile (snippet format may change)
- ❌ Requires constant maintenance
- ❌ May break with different sources

---

## RECOMMENDATION

**IMMEDIATE ACTION (Phase 3):**
1. **Replace Google CSE with Yahoo Finance unofficial API** for SPY, Gold, Bitcoin
2. **Use powerball.com official API or scraping** for Powerball (non-negotiable requirement)
3. **Use Bankrate API or scraping** for mortgage rates

**FALLBACK (if APIs unavailable):**
1. Rewrite extraction logic with context-aware regex patterns
2. Add extensive logging to debug failures
3. Add validation (e.g., SPY price must be 400-800, Gold must be 2000-5000)

---

## NEXT STEPS

**Phase 3: Implement Fixes**
1. Research Yahoo Finance unofficial API endpoints
2. Test API responses in sandbox
3. Rewrite fetch functions to use structured APIs
4. Deploy and validate on live site
5. Verify all values match source pages (±5% tolerance)
