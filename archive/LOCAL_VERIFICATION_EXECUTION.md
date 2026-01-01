# Local Verification Execution Plan

## Step 1: Project Analysis ✅

**Findings**:
- Vercel CLI installed: ✅ (version 50.1.3)
- Production API functions: `api/market.ts`, `api/ai-news.ts`
- Frontend: Vite dev server (port 3000)
- Backend: Vercel serverless functions (need `vercel dev`)

## Step 2: Minimal Files to Verify

### Core API Functions (Must Test)
1. `api/market.ts` - Market data endpoint
2. `api/ai-news.ts` - AI news endpoint

### Configuration Files (Must Check)
3. `vercel.json` - Deployment config
4. `.env.local` - Local environment variables (create if needed)

## Step 3: Local Testing Setup

### Option A: Use `vercel dev` (Recommended)
```bash
# Login to Vercel (if not already)
vercel login

# Link project (if not already)
vercel link

# Start dev server
vercel dev
```

**Port**: Usually 3000 (or next available)

### Option B: Create Local Adapter (If vercel dev doesn't work)
Create `server/local-adapter.ts` to wrap Vercel functions in Express routes.

## Step 4: Verification Commands

### Test Market API
```bash
curl "http://localhost:3000/api/market?nocache=1" | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

**Expected Output**:
- `data.btc.value`: number (50,000-150,000 range)
- `data.spy.value`: number (400-800 range)  
- `data.gold.value`: number (1,500-3,000 range)
- `data.powerball.value`: "Unavailable"
- `data.powerball.source_url`: "https://www.powerball.com/"
- `fetched_at`: ISO timestamp (recent)
- `cache_hit`: false

### Test AI News API
```bash
curl "http://localhost:3000/api/ai-news?nocache=1" | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

**Expected Output**:
- `news`: array with 4-5 items (or empty with debug info)
- Each item has: `title`, `url`, `source_name`, `snippet`, `summary_zh`, `why_it_matters_zh`
- No URLs with `/quote/`, `/symbol/`, `/stock/`
- All URLs from allowed domains
- `fetched_at`: ISO timestamp (recent)
- `cache_hit`: false

## Step 5: Create Test Script

Create `scripts/test-local-api.ps1` for automated testing.

## Next Action

**Before making code changes**, I need to:
1. ✅ Verify project structure (done)
2. ⏳ Test if `vercel dev` works locally
3. ⏳ Run verification commands
4. ⏳ Document results

**Should I proceed with testing `vercel dev` now?**
