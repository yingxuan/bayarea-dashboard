# Session Context

Date: 2026-03-12

## Current Product Direction

The product is being pushed away from `data-punk / terminal dashboard` and toward a `lifestyle utility` direction:

- still dark-theme
- still information-dense
- less terminal-like
- more mobile-first
- more like a daily decision helper for Bay Area Chinese engineers

Primary product surfaces now:

- `/` home briefing
- `/piaozi` money
- `/baoguo` work
- `/fangzi` housing
- `/chihe` food

## What Was Completed

### Shared UI system

Updated shared UI language across the app:

- softer palette and surfaces in [client/src/index.css](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/index.css)
- unified navigation shell in [client/src/components/Navigation.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/Navigation.tsx)
- shared route header treatment across:
  - [client/src/pages/Piaozi.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/pages/Piaozi.tsx)
  - [client/src/pages/Baoguo.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/pages/Baoguo.tsx)
  - [client/src/pages/Fangzi.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/pages/Fangzi.tsx)
  - [client/src/pages/Chihe.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/pages/Chihe.tsx)

### Home page

Home was pushed further toward a true briefing page in [client/src/pages/Home.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/pages/Home.tsx):

- hero now behaves more like a daily briefing
- added 4 overview cards for money / work / housing / food
- top-of-page hierarchy is now more summary-first
- housing pulse is surfaced higher

### Home high-visibility modules

Reworked:

- [client/src/components/FortuneWidget.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/FortuneWidget.tsx)
- [client/src/components/PortfolioHero.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/PortfolioHero.tsx)
- [client/src/components/TodaySpendCarousels.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/TodaySpendCarousels.tsx)

Intent:

- less mini-dashboard feel
- more lightweight product card feel
- less visual harshness

### Food / Chihe

This is the most recently polished area.

Reworked:

- [client/src/components/SpendCarousel.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/SpendCarousel.tsx)
- [client/src/components/chihe/PlaceCard.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/chihe/PlaceCard.tsx)
- [client/src/components/chihe/CategoryTabs.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/chihe/CategoryTabs.tsx)
- [client/src/components/chihe/BubbleTeaFull.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/chihe/BubbleTeaFull.tsx)
- [client/src/components/chihe/ChineseFoodFull.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/chihe/ChineseFoodFull.tsx)
- [client/src/components/chihe/LateNightFull.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/chihe/LateNightFull.tsx)
- [client/src/components/chihe/NewPlacesFull.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/chihe/NewPlacesFull.tsx)

Result:

- less dashboard-like
- less debug/dev-feel in primary UI
- cleaner consumption flow
- more lifestyle-product tone

## Git / Deploy State

Latest pushed commit:

- `ef8ade3` `Refine lifestyle UI across home and chihe`

Previous major product commit:

- `f357337` `Revamp dashboard UI and add work and housing modules`

Production URL:

- `https://bayarea-dashboard.vercel.app`

Production deployment had succeeded earlier in this session.

## Validation Status

`pnpm build` passed after the latest UI work.

Known remaining warnings:

- `idb-keyval` is both dynamically and statically imported, so it is not chunking cleanly
- frontend main bundle is still large, around `896-909 kB` depending on the exact build

These are not newly introduced regressions from the latest UI edits.

## Important Local Files To Ignore

These were intentionally not committed:

- `.claude/settings.local.json`
- `fix.md`
- `progress.txt`

Do not accidentally include them in future commits unless explicitly asked.

## Recommended Next Steps

Highest-value next steps:

1. Continue polishing [client/src/pages/Chihe.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/pages/Chihe.tsx)
   - make page-level flow feel even less like a dashboard wrapper
   - tighten transitions between header, tabs, and content sections

2. Start code splitting
   - split home / piaozi / baoguo / fangzi / chihe
   - reduce production main bundle
   - improve first-load performance

3. Continue removing remaining dashboard feel from other content-heavy modules
   - [client/src/components/IndicesCard.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/IndicesCard.tsx)
   - [client/src/components/USStockYouTubers.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/USStockYouTubers.tsx)
   - [client/src/components/FanwanCarousel.tsx](/C:/Users/yxuan/workspace/bayarea-dashboard/client/src/components/FanwanCarousel.tsx)
   - remaining long-list modules under `/piaozi` and `/baoguo`

4. Re-check production visually
   - homepage
   - `/chihe`
   - mobile layout rhythm
   - CTA prominence

## Working Rules To Remember

- use `apply_patch` for file edits
- do not revert unrelated user changes
- prefer concise, pragmatic updates
- when verifying builds, `pnpm.cmd build` is already approved
- when pushing, `git push origin main` is already approved
