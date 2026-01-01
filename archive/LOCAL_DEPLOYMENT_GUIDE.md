# Local Deployment Guide

## Overview

This guide shows how to run the full application locally (frontend + backend) using the production API functions.

## Architecture

- **Frontend**: Vite dev server (port 3000)
- **Backend**: Express server (port 3001) using production Vercel serverless functions
- **API Functions**: Wrapped via `server/local-api-adapter.ts`

## Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Set Environment Variables (Optional)

Create `.env.local` file:
```
NEWS_API_KEY=your_key_here
YELP_API_KEY=your_key_here  # Optional
TMDB_API_KEY=your_key_here   # Optional
```

Or set system environment variables.

### 3. Start Local Server

**Option A: Run server only** (for API testing)
```bash
pnpm dev:server
```

Server will run on `http://localhost:3001`

**Option B: Run full stack** (frontend + backend)

**Terminal 1** (Backend):
```bash
pnpm dev:server
```

**Terminal 2** (Frontend):
```bash
pnpm dev
```

Frontend will run on `http://localhost:3000` and proxy API requests to `http://localhost:3001`

## Testing Endpoints

### Test Market API
```powershell
curl.exe "http://localhost:3001/api/market?nocache=1"
```

### Test AI News API
```powershell
curl.exe "http://localhost:3001/api/ai-news?nocache=1"
```

### Test Other Endpoints
```powershell
curl.exe "http://localhost:3001/api/gossip?nocache=1"
curl.exe "http://localhost:3001/api/deals?nocache=1"
curl.exe "http://localhost:3001/api/restaurants?nocache=1"
curl.exe "http://localhost:3001/api/shows?nocache=1"
```

## Verification Checklist

After starting the server, verify:

- [ ] Server starts without errors on port 3001
- [ ] `/api/market?nocache=1` returns market data
- [ ] `/api/ai-news?nocache=1` returns news (or debug info if NEWS_API_KEY missing)
- [ ] Frontend can connect to backend (if running full stack)
- [ ] Cache bypass works (`?nocache=1`)

## Files Modified

1. `server/index.ts` - Updated to use production API functions
2. `server/local-api-adapter.ts` - Adapter for Express → Vercel functions
3. `package.json` - Added `dev:server` script

## Troubleshooting

### Port Already in Use
If port 3001 is busy, set `PORT` environment variable:
```bash
$env:PORT=3002; pnpm dev:server
```

### API Functions Not Working
- Check that environment variables are set
- Verify `api/` directory functions are correct
- Check server logs for errors

### Frontend Can't Connect
- Verify backend is running on port 3001
- Check `vite.config.ts` proxy settings
- Check browser console for CORS errors
