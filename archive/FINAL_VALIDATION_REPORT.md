
# BayArea Dashboard Final Validation Report

## 1. Market Data Verification
- **BTC:** Fetched from CoinGecko API.
- **SPY:** Fetched from Stooq API.
- **Gold:** Fetched from Stooq API.
- **Mortgage:** Set to "Unavailable" (No reliable API).
- **Powerball:** Set to "Unavailable" (No scraping allowed).

### Live JSON Evidence (/api/market?nocache=1)
```json
{
  "data": {
    "spy": {
      "name": "SPY",
      "value": 681.92,
      "unit": "USD",
      "source_name": "Stooq",
      "source_url": "https://finance.yahoo.com/quote/SPY/",
      "as_of": "2026-01-01T21:37:58.847Z"
    },
    "gold": {
      "name": "Gold",
      "value": 4318.59,
      "unit": "USD/oz",
      "source_name": "Stooq",
      "source_url": "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
      "as_of": "2026-01-01T21:37:58.854Z"
    },
    "btc": {
      "name": "BTC",
      "value": 88254,
      "unit": "USD",
      "source_name": "CoinGecko",
      "source_url": "https://www.coingecko.com/en/coins/bitcoin",
      "as_of": "2026-01-01T21:37:58.435Z"
    },
    "mortgage": {
      "name": "CA_JUMBO_ARM",
      "value": "Unavailable",
      "unit": "rate",
      "source_name": "Bankrate",
      "source_url": "https://www.bankrate.com/mortgages/mortgage-rates/"
    },
    "powerball": {
      "name": "POWERBALL",
      "value": "Unavailable",
      "unit": "USD",
      "source_name": "Powerball.com",
      "source_url": "https://www.powerball.com/"
    }
  },
  "updated_at": "1/1, 1:37 PM",
  "fetched_at": "2026-01-01T21:37:58.854Z",
  "cache_hit": false,
  "cache_mode": "bypass",
  "age": 0,
  "expiry": 600
}
```

## 2. News Filtering Verification
- **Allowlist:** Reuters, The Verge, TechCrunch, Wired, etc.
- **Rejection:** Stock quote pages, Yahoo Finance, MarketWatch.
- **Click-test:** All links verified to be real articles.

### Filter Test Results
- `https://www.reuters.com/technology/ai-news` -> **PASS**
- `https://theverge.com/new-gadget` -> **PASS**
- `https://finance.yahoo.com/quote/AAPL` -> **REJECTED**
- `https://unknown-blog.com/post` -> **REJECTED**

## 3. UI Cleanup
- **Packages Section:** Disabled in `Home.tsx` as it lacked a real data source.
- **Food/Fun Section:** Functional with real Yelp data (via `/api/restaurants`).
- **No Mock Data:** All sections use live APIs or are disabled.

## 4. Observability
- All `/api/*` endpoints support `?nocache=1`.
- All responses include `fetched_at`, `age`, and `expiry` fields.
