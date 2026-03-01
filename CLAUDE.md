# Sub-folder Context
[继承全局指令："C:\Users\yxuan\workspace\CLAUDE.md"]

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bay Area Engineer's Daily Decision Dashboard (湾区码农每日决策仪表盘) - A judgment-based information hub for Chinese software engineers in the SF Bay Area. Built with React 19, TypeScript, Tailwind CSS 4, and Express backend.

**Core Philosophy**: Judgment over aggregation - every piece of content is scored/filtered based on relevance to Bay Area engineers. Users should scan the dashboard in 3-5 minutes to understand: How is my money doing? What's happening at work? What's worth my attention?

## Development Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Start Vite frontend (port 3000)
pnpm dev:server           # Start Express backend (port 3001)
pnpm dev:full             # Start both frontend and backend

pnpm build                # Build for production (Vite + esbuild)
pnpm start                # Start production server

pnpm check                # TypeScript type checking
pnpm lint                 # ESLint (zero warnings allowed)
pnpm lint:fix             # ESLint with auto-fix
pnpm format               # Prettier formatting

pnpm test                 # Run all tests with Vitest
pnpm test:wenxuecity      # Run specific test file
```

## Architecture

### Directory Structure

- `client/src/` - React frontend (components, pages, hooks, contexts)
- `server/` - Express backend server with API routes
- `api/` - Vercel serverless functions (deployed as edge functions)
- `lib/` - Shared business logic modules (fortune, gossip, places, spend, youtube)
- `shared/` - Shared types and utilities between client/server

### Path Aliases

- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

### Frontend Architecture

- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4 with "Data Punk" cyberpunk theme (dark background, neon accents)
- **Routing**: Wouter (lightweight client-side router)
- **UI Components**: shadcn/ui
- **Animations**: Framer Motion

### Backend Architecture

- **Runtime**: Express server on port 3001 (dev), serves API routes
- **Vercel Functions**: API routes in `api/` are deployed as serverless functions
- **Local Dev**: `server/local-api-adapter.ts` wraps Vercel functions for local Express server
- **Caching**: SQLite file-based cache (`cache.db`), Vercel KV for production. Auth users: SQLite locally, **Neon Postgres on Vercel** when `POSTGRES_URL` or `DATABASE_URL` is set (add Neon from Vercel Marketplace).
- **Rewrites**: `vercel.json` consolidates multiple API handlers into `market-all.ts`

### Data Flow

1. Frontend fetches from `/api/*` endpoints
2. In dev: Vite proxies `/api` to Express server on port 3001
3. In production: Vercel serverless functions handle requests
4. Backend reads from cache first, falls back to external APIs, then mock data

## Key Design Constraints

### LLM Usage (Critical)
- **Never call LLM during page requests** - only via scheduled batch jobs
- LLM results are cached to Redis/DB/SQLite
- Dev environment uses mock/cached data by default

### Content Rules
- Homepage modules have hard caps on item counts
- Chinese-first content, English as secondary
- No infinite scroll, no expand/collapse patterns
- Mobile-first responsive design

### API Keys
All API keys are server-side only (no `VITE_` prefix). Required keys:
- `FINNHUB_API_KEY` - Stock quotes
- `GOOGLE_PLACES_API_KEY` - Food recommendations
- `GEMINI_API_KEY` - Market news translation

## Testing

Tests are in `server/__tests__/` and use Vitest:
```bash
pnpm test                              # Run all tests
vitest server/__tests__/specific.test.ts  # Run single test file
```

## Deployment

Deployed to Vercel. After changing environment variables in Vercel dashboard, **must redeploy** for changes to take effect.
