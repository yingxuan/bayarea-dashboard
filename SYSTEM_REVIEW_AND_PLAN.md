# System Review & Strategic Plan
**BayArea Dashboard - Diagnosis & Path Forward**

---

## 1. GOAL SUMMARY (≤10 bullets)

1. **Product**: BayArea Dashboard — "湾区码农的每日决策仪表盘" (Bay Area Engineer's Daily Decision Dashboard)
2. **Core Value**: Make judgments, not pile info — filter and present relevant information for decision-making
3. **Time Budget**: Homepage scannable in 3-5 minutes
4. **Three Pillars**:
   - **Money**: Market data (SPY, Gold, BTC, CA Jumbo rate, Powerball)
   - **Work**: Industry/AI news (4-5 items, last 24h, real articles only)
   - **Life**: High-signal local items (food/fun, deals, gossip) — real or disabled, never mock
5. **Non-Negotiables**:
   - No mock/placeholder data in production
   - Every item has correct clickable link to authoritative source
   - Local-first validation (Vercel deploy is NOT the debugging loop)
   - Pricing from stable APIs/feeds (NOT Google CSE snippets)
   - Unsupported modules must be explicitly disabled (no dead UI, no blank sections)

---

## 2. SYSTEM DIAGRAM (Text)

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React/Vite - Port 3000)                            │
│                                                               │
│  Home.tsx                                                     │
│  ├─ FinanceOverview ──────→ /api/market                     │
│  ├─ NewsList ──────────────→ /api/ai-news                   │
│  ├─ GossipList ─────────────→ /api/gossip                    │
│  ├─ DealsGrid ──────────────→ /api/deals                     │
│  ├─ FoodGrid ───────────────→ /api/restaurants               │
│  └─ ShowsCard ──────────────→ /api/shows                    │
│                                                               │
│  Config: apiBaseUrl = VITE_API_BASE_URL || vercel.app        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (proxy in dev)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (Vercel Serverless Functions - api/*.ts)            │
│                                                               │
│  /api/market.ts                                              │
│  ├─ fetchBTC() ────────────→ CoinGecko API                  │
│  ├─ fetchSPY() ─────────────→ Stooq API (CSV)               │
│  ├─ fetchGold() ────────────→ Stooq API (CSV)               │
│  ├─ fetchMortgageRate() ────→ "Unavailable" (no API)        │
│  └─ fetchPowerball() ───────→ "Unavailable" (no API)        │
│                                                               │
│  /api/ai-news.ts                                             │
│  ├─ fetchNewsAPIEverything() → NewsAPI.org /v2/everything    │
│  ├─ fetchNewsAPIHeadlines() → NewsAPI.org /v2/top-headlines  │
│  ├─ isArticleValid() ───────→ Domain allowlist filter        │
│  └─ enhanceNewsItem() ──────→ Add Chinese summaries          │
│                                                               │
│  /api/gossip.ts ─────────────→ Hacker News Firebase API      │
│  /api/deals.ts ──────────────→ Reddit JSON API               │
│  /api/restaurants.ts ───────→ Yelp Fusion API (req. key)     │
│  /api/shows.ts ──────────────→ TMDB API (req. key)            │
│                                                               │
│  Caching: In-memory Map (per Vercel instance)                │
│  TTL: Market=10min, News=30min, Others vary                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ External APIs
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ DATA SOURCES                                                 │
│                                                               │
│  ✅ CoinGecko API ───────────→ BTC price (free, stable)       │
│  ✅ Stooq API ───────────────→ SPY, Gold (free, CSV format)   │
│  ⚠️  NewsAPI.org ────────────→ News (free tier: 100/day)     │
│  ✅ Hacker News API ────────→ Gossip (free, public)          │
│  ✅ Reddit JSON API ────────→ Deals (free, public)           │
│  ❌ Mortgage Rate ───────────→ No reliable free API           │
│  ❌ Powerball ───────────────→ No API, scraping prohibited   │
│  ⚠️  Yelp API ───────────────→ Restaurants (req. key, paid)  │
│  ⚠️  TMDB API ───────────────→ Shows (req. key, free tier)    │
└─────────────────────────────────────────────────────────────┘

LOCAL DEV LAYER (server/local-api-adapter.ts):
  Express server (port 3001) wraps Vercel functions for local testing
  Adapter converts Express Request/Response → Vercel Request/Response
```

---

## 3. TOP 5 BLOCKERS + FIXES

### BLOCKER #1: News API Returns Empty (Domain Filtering Too Strict)
**Impact**: HIGH — Core feature broken  
**Effort**: LOW — Configuration fix

**Problem**:
- NewsAPI returns articles from `biztoc.com` and other domains
- Domain allowlist filters them all out
- Result: Empty news array even when API works

**Root Cause**:
- Allowlist expanded but NewsAPI free tier may return different domains
- No fallback strategy when all articles filtered

**Fix**:
1. **Immediate**: Log sample domains when filtering, add more common tech news domains
2. **Better**: Use NewsAPI's `domains` parameter to request specific sources
3. **Best**: Hybrid approach — use `top-headlines` with `category=technology` (guaranteed to work on free tier) + filter by domain

**Rank**: #1 (High Impact, Low Effort)

---

### BLOCKER #2: Dual Implementation Complexity (Vercel Functions + Express Server)
**Impact**: MEDIUM — Maintenance burden, confusion  
**Effort**: MEDIUM — Refactoring

**Problem**:
- Production uses Vercel serverless functions (`api/*.ts`)
- Local dev requires adapter layer (`server/local-api-adapter.ts`)
- Legacy Express routes in `server/api.ts` (unused but present)
- Two code paths to maintain

**Root Cause**:
- Started with Express, migrated to Vercel, kept both

**Fix**:
1. **Short-term**: Document that `api/*.ts` is source of truth, `server/` is only for local testing
2. **Medium-term**: Remove unused Express routes, simplify adapter
3. **Long-term**: Consider using `vercel dev` for local testing (eliminates adapter)

**Rank**: #2 (Medium Impact, Medium Effort)

---

### BLOCKER #3: "Unavailable" Items Show Without Context
**Impact**: MEDIUM — User confusion  
**Effort**: LOW — UI/UX fix

**Problem**:
- Mortgage rate and Powerball show "Unavailable" but UI doesn't explain why
- Users see dead/confusing sections
- No clear "disabled" state

**Root Cause**:
- Backend returns "Unavailable" but frontend doesn't handle gracefully
- No explicit "disabled" state in UI

**Fix**:
1. **Immediate**: Frontend checks for "Unavailable" and shows "Not available — click to check source" with link
2. **Better**: Add `disabled: true` flag in API response, frontend hides/shows disabled state
3. **Best**: Explicit "Coming Soon" or "Check Source" UI for unavailable items

**Rank**: #3 (Medium Impact, Low Effort)

---

### BLOCKER #4: Testing Loop Dependency on Vercel Deployment
**Impact**: HIGH — Slow feedback, blocks development  
**Effort**: LOW — Already partially solved

**Problem**:
- Previously tested against Vercel (slow, requires deploy)
- Local testing now works but not fully integrated into workflow

**Root Cause**:
- Vercel functions need adapter for local testing
- No clear "local-first" workflow documented

**Fix**:
1. ✅ **Done**: Created `server/local-api-adapter.ts` and `scripts/test-local-api.ts`
2. **Next**: Document local-first workflow, add to CI/CD if applicable
3. **Best**: Use `vercel dev` for true local Vercel environment (if possible)

**Rank**: #4 (High Impact, Low Effort — mostly solved)

---

### BLOCKER #5: Optional Modules (Restaurants, Shows) Require API Keys
**Impact**: LOW — Optional features  
**Effort**: LOW — Already handled

**Problem**:
- Restaurants and Shows require API keys (Yelp, TMDB)
- If keys missing, endpoints return empty arrays
- Frontend may show empty sections

**Root Cause**:
- Optional features need optional dependencies
- No clear "disabled" state when keys missing

**Fix**:
1. ✅ **Done**: Endpoints return empty arrays with helpful messages
2. **Next**: Frontend checks for empty arrays and shows "Not configured" or hides section
3. **Best**: Add feature flags in config, explicitly enable/disable modules

**Rank**: #5 (Low Impact, Low Effort — mostly solved)

---

## 4. DATA SOURCE EVALUATION TABLE

| Module | Primary Source | Fallback Source | Cache TTL | Failure Behavior | Notes/Risks |
|--------|---------------|-----------------|-----------|------------------|-------------|
| **BTC Price** | CoinGecko API (`/api/v3/simple/price`) | None needed | 10 min | Returns "Unavailable" with source_url | ✅ **EXCELLENT**: Free, stable, reliable. No rate limits on free tier. |
| **SPY Price** | Stooq API (CSV format) | Yahoo Finance API (if Stooq fails) | 10 min | Returns "Unavailable" with source_url | ⚠️ **GOOD**: Free, but CSV parsing is fragile. Consider JSON API if available. |
| **Gold Price (XAUUSD)** | Stooq API (CSV format) | LBMA API or Kitco (if Stooq fails) | 10 min | Returns "Unavailable" with source_url | ⚠️ **GOOD**: Free, but CSV parsing. Gold is XAUUSD on Stooq, verify symbol. |
| **CA Jumbo Mortgage Rate** | None (no reliable free API) | Bankrate (scraping prohibited) | N/A | Returns "Unavailable" with bankrate.com source_url | ❌ **BLOCKED**: No free API. Options: 1) Remove module, 2) Manual update, 3) Paid API (Freddie Mac). **Recommendation**: Remove or make manual. |
| **Powerball Jackpot** | None (no API, scraping prohibited) | powerball.com (scraping prohibited) | N/A | Returns "Unavailable" with powerball.com source_url | ❌ **BLOCKED**: No API, scraping violates ToS. **Recommendation**: Keep as "Unavailable" with link, or remove module. |
| **AI/Tech News** | NewsAPI.org `/v2/everything` | NewsAPI.org `/v2/top-headlines` (category=technology) | 30 min | Returns empty array with debug info | ⚠️ **GOOD BUT FIXABLE**: Free tier limited (100 req/day). Domain filtering too strict. **Fix**: Use `top-headlines` with `category=technology` + domain filter. |

**Additional Modules**:
| Module | Primary Source | Fallback Source | Cache TTL | Failure Behavior | Notes/Risks |
|--------|---------------|-----------------|-----------|------------------|-------------|
| **Gossip (Hacker News)** | Hacker News Firebase API | None needed | 30 min | Returns empty array | ✅ **EXCELLENT**: Free, public, reliable. |
| **Deals (Reddit)** | Reddit JSON API (`/r/deals/hot.json`) | None needed | 30 min | Returns empty array | ✅ **EXCELLENT**: Free, public, reliable. |
| **Restaurants** | Yelp Fusion API | None (requires key) | 12 hours | Returns empty array with error message | ⚠️ **OPTIONAL**: Requires API key (paid). Can disable if key not available. |
| **Shows** | TMDB API | None (requires key) | 12 hours | Returns empty array with error message | ⚠️ **OPTIONAL**: Requires API key (free tier available). Can disable if key not available. |

---

## 5. NEXT-STEP PLAN (1-2 Weeks)

### MILESTONE 1: Fix News API (Days 1-2)
**Goal**: News API returns 4-5 articles consistently

**Acceptance Criteria**:
- [ ] `/api/ai-news?nocache=1` returns 4-5 articles (not empty)
- [ ] All articles from allowed domains
- [ ] No stock quote pages (`/quote/`, `/symbol/`, `/stock/`)
- [ ] All URLs clickable and open real articles
- [ ] Chinese summaries present

**Local Verification**:
```bash
# Test news API
curl "http://localhost:3001/api/ai-news?nocache=1" | jq '.news | length'
# Expected: 4-5

# Verify no stock quotes
curl "http://localhost:3001/api/ai-news?nocache=1" | jq '.news[].url' | grep -E "(quote|symbol|stock)"
# Expected: No matches

# Test with unit test
pnpm test:api
# Expected: AI News API passes
```

**Changes**:
- Switch to `top-headlines` with `category=technology` (guaranteed free tier)
- Relax domain filter or use NewsAPI's `domains` parameter
- Add more tech news domains to allowlist

**Risk**: Low — Configuration change only

---

### MILESTONE 2: Improve "Unavailable" UX (Days 3-4)
**Goal**: Clear UI for unavailable items

**Acceptance Criteria**:
- [ ] Mortgage rate shows "Not available — check source" with link
- [ ] Powerball shows "Not available — check source" with link
- [ ] No confusing "Unavailable" text without context
- [ ] Empty sections for optional modules (restaurants, shows) show "Not configured" or are hidden

**Local Verification**:
```bash
# Test market API
curl "http://localhost:3001/api/market?nocache=1" | jq '.data.mortgage, .data.powerball'
# Verify source_url present

# Test frontend (manual)
# Open http://localhost:3000
# Verify "Unavailable" items show helpful message
```

**Changes**:
- Frontend: Check for "Unavailable" and render helpful UI
- API: Add `disabled: true` flag for unavailable items
- Frontend: Hide or show "Not configured" for empty optional modules

**Risk**: Low — UI changes only

---

### MILESTONE 3: Simplify Local Dev Setup (Days 5-6)
**Goal**: Clear local-first workflow

**Acceptance Criteria**:
- [ ] Single command to start local dev (`pnpm dev:local` or similar)
- [ ] All tests pass locally (`pnpm test:api`)
- [ ] Documentation updated with local-first workflow
- [ ] Remove unused Express routes

**Local Verification**:
```bash
# Start local dev
pnpm dev:local  # or equivalent

# Test all endpoints
pnpm test:api
# Expected: All pass

# Test frontend connects
curl "http://localhost:3000"  # Should load frontend
```

**Changes**:
- Create `pnpm dev:local` script (starts both frontend and backend)
- Remove unused `server/api.ts` routes
- Update documentation

**Risk**: Low — Refactoring only

---

### MILESTONE 4: Data Source Hardening (Days 7-10)
**Goal**: Ensure all data sources are reliable

**Acceptance Criteria**:
- [ ] SPY and Gold have fallback sources if Stooq fails
- [ ] News API has fallback to headlines if everything endpoint fails
- [ ] All "Unavailable" items have clear source links
- [ ] Optional modules (restaurants, shows) can be disabled via config

**Local Verification**:
```bash
# Test fallbacks (simulate API failure)
# Mock Stooq failure, verify fallback works

# Test news fallback
# Set NEWS_API_KEY to invalid, verify headlines fallback works
```

**Changes**:
- Add fallback for SPY/Gold (Yahoo Finance or Alpha Vantage)
- Ensure news fallback to headlines works
- Add feature flags for optional modules

**Risk**: Medium — Requires testing fallback scenarios

---

### MILESTONE 5: Final Verification & Documentation (Days 11-14)
**Goal**: Complete system verification and documentation

**Acceptance Criteria**:
- [ ] All endpoints tested locally and pass
- [ ] Frontend displays all data correctly
- [ ] No mock data in production code paths
- [ ] Documentation complete (local dev, data sources, deployment)
- [ ] Ready for production deployment

**Local Verification**:
```bash
# Full system test
pnpm test:api
pnpm dev:local
# Manual testing of frontend

# Verify no mock data
grep -r "mockData\|mock" api/ server/ --exclude-dir=node_modules
# Expected: No matches in production code
```

**Changes**:
- Final testing and bug fixes
- Documentation updates
- Deployment preparation

**Risk**: Low — Verification and docs only

---

## WHAT WE WILL NOT DO (Yet)

- ❌ Full site rewrite
- ❌ User authentication system
- ❌ Database for caching (keep in-memory for now)
- ❌ Real-time WebSocket updates
- ❌ Mobile app
- ❌ Advanced filtering/search
- ❌ User preferences/customization
- ❌ Payment integration for premium APIs
- ❌ Scraping (violates ToS)
- ❌ Mock data in production

---

## SUCCESS METRICS

**Week 1**:
- News API returns articles consistently
- "Unavailable" items have clear UX
- Local dev workflow documented

**Week 2**:
- All data sources have fallbacks
- Optional modules can be disabled
- System ready for production

**Overall**:
- ✅ No mock data in production
- ✅ All items have clickable source links
- ✅ Local-first validation workflow
- ✅ 3-5 minute homepage scan time
- ✅ All three pillars (Money, Work, Life) functional or explicitly disabled

---

## RISK ASSESSMENT

**Low Risk** ✅:
- News API fix (configuration)
- UX improvements (frontend only)
- Documentation (non-breaking)

**Medium Risk** ⚠️:
- Data source fallbacks (requires testing)
- Feature flags (configuration complexity)

**High Risk** ❌:
- None identified

---

## CONCLUSION

**Current State**: System is 80% complete, blocked by news API filtering and UX clarity issues.

**Path Forward**: Focus on high-impact, low-effort fixes first (news API, UX), then harden data sources, then finalize.

**Timeline**: 2 weeks to production-ready state.

**Confidence**: High — all blockers are solvable with configuration and UI changes, no architectural changes needed.
