# Bay Area Dashboard Product Improvement Plan

## Summary

This plan upgrades the product from a useful dashboard into a daily decision operating system for Bay Area Chinese engineers. The current repo and live site already support a strong finance and dining core, but the product vision is broader than the shipped information architecture: the live navigation only exposes `Home / 票子 / 吃喝`, while the strategy docs clearly point toward a fuller daily-decision product spanning money, work, life, and community.

The plan below keeps the current architecture (`Vite + React + Vercel serverless + local/durable caching`) and evolves the product in phases with a bias toward judgment, reliability, and fast mobile scanning.

From a UI and brand-design perspective, the current site has a usable `Data Punk` foundation, but it still reads more like a developer-built dashboard than a mature product surface. The main gap is not raw styling effort; it is visual hierarchy, narrative flow, interaction polish, and consistency of component language. The design plan below treats UI as a first-class product system rather than a final paint pass.

## Product Direction

### 1. Reposition the product around three daily questions

- Homepage must answer, in order: `我的钱怎么样了`, `工作上有什么变化`, `今天有什么值得行动`.
- Reduce entertainment-first framing on the homepage; entertainment remains available but becomes secondary to money, work, and practical life decisions.
- Keep Chinese-first copy and Bay Area specificity as hard product rules.

### 2. Restructure information architecture

- Keep the current routes `/`, `/piaozi`, `/chihe`, but expand the top-level model to six decision areas:
  - `首页`
  - `票子` for portfolio, indices, market judgment, and compensation-adjacent content
  - `包裹` for jobs, layoffs, hiring signals, salary/offer content, and work-visa signals
  - `房子` for rates, rent/buy signals, and South Bay housing watchlist content
  - `吃喝` for meal decisions and new openings
  - `羊毛/吃瓜` as a lightweight practical/community layer
- Add `包裹` and `房子` first; keep `税` as a later module unless there is strong recurring user demand.
- Homepage remains the 3-5 minute scan surface; deeper routes become 5-15 minute detail surfaces.

### 3. Clarify the product promise on first load

- Replace generic branding with a sharper hero/subhead that states this is a daily Bay Area Chinese engineer dashboard, not a content feed.
- Add a short `today's decision summary` strip near the top:
  - market stance
  - work market stance
  - one practical action
- Standardize module headers so every section visibly answers `why this matters`.

## Design Diagnosis

### 1. Current UI strengths

- Dark `Data Punk` theme already gives the product a recognizable personality.
- Finance and food sections have enough density to feel useful.
- Typography and color tokens already exist, so this is a systems problem, not a blank-canvas problem.

### 2. Current UI weaknesses

- Page composition is too uniform: sections are visually similar in weight, so users do not immediately know where to look first.
- Section headers are understated to the point of under-signaling importance; key modules do not create strong “entry points”.
- Cards prioritize containment over hierarchy, which makes everything feel equally important.
- The homepage reads as stacked modules, not as a designed editorial experience with rhythm, pacing, and emphasis.
- The current navigation is functional but not branded; it does not feel like the command bar of a daily decision product.
- Color is present, but not orchestrated: neon accents exist, yet they are not mapped clearly to semantic meaning and section identity.
- Mobile scanning is acceptable but not optimized around thumb flow, glanceability, and one-handed use.

### 3. Design principle for the next version

- Do not “beautify” by adding more glow, gradients, or decorative chrome.
- Improve legibility first, then hierarchy, then emotion.
- Treat the homepage like a newsroom front page mixed with a Bloomberg terminal, but tuned for Chinese Bay Area life.
- Make every section answer one question fast; beauty should reinforce decision speed.

## Implementation Changes

### A. Homepage and navigation

- Rewrite homepage composition so section order becomes:
  - `今日判断`
  - `票子`
  - `包裹`
  - `吃喝`
  - `房子`
  - `羊毛/吃瓜`
- Move shows/movies/concerts below the decision-critical modules or into an optional lower-priority section.
- Expand navigation from the current 3-item structure to the new module set, with mobile-first tab labels and sticky section awareness.
- Add a persistent `last updated / data freshness` layer for every section so stale data is visible without opening cards.
- Add empty-state discipline: every module must show either live content, stale-but-labeled content, or an explicit unavailable state with a fallback explanation.

### A1. Homepage visual redesign

- Redesign the top of the page into three clearly distinct layers:
  - sticky command nav
  - branded summary hero
  - decision modules
- Give the hero a stronger visual identity:
  - Chinese-first title
  - short positioning sentence
  - `今日判断` chips for money, work, and action
- Break the current “same card, same border, same density” rhythm with intentional contrast:
  - one dominant hero module
  - one secondary support strip
  - compact tertiary lists
- Use asymmetry on desktop and tighter vertical rhythm on mobile so the page feels editorial rather than auto-generated.

### A2. Navigation redesign

- Turn the nav into a command surface rather than a plain tab bar.
- Add stronger active-state treatment with section color coding and subtle underline/glow, not just text color.
- Add quick-jump behavior for homepage sections on mobile.
- Keep language toggle and user menu, but visually subordinate them to primary navigation.

### A3. Component hierarchy and density rules

- Define three card families and use them consistently:
  - `Hero cards` for portfolio, today summary, and future work/housing overview
  - `Decision cards` for actionable ranked items
  - `List rows` for gossip, deals, and fast-scan feeds
- Remove visual noise from low-value borders; use fewer but more intentional separators.
- Increase spacing between sections, but tighten spacing within each information cluster.
- Use typography, not extra decoration, to show priority:
  - large number / concise label / short explanation
  - headline / why-it-matters / metadata

### B. Finance (`票子`) improvements

- Upgrade the current portfolio flow into a true personal finance dashboard:
  - holdings health
  - concentration risk
  - RSU-heavy exposure warnings
  - `what changed vs yesterday`
- Extend index coverage to the metrics Bay Area engineers actually track:
  - SPY, QQQ, BTC, Gold
  - rates and mortgage signals
  - VIX / DXY / tech concentration indicators
- Tighten market news into judgment objects rather than feed items:
  - Chinese summary
  - why-it-matters
  - actionability label
  - relevance score
- Keep request-time quotes, but move heavier portfolio summaries and derived analytics to precomputed snapshots where possible.

### C. Work (`包裹`) module

- Create a new work-focused route and homepage block built from existing jobs/layoff/community sources plus new structured summaries.
- Ship three submodules:
  - `裁员/招聘温度`
  - `面试/跳槽风向`
  - `签证/身份相关政策信号` when source quality is strong
- Use community and news sources to produce judgmented work signals, not raw lists.
- Add a weekly compensation pulse if sufficient sources can be normalized; otherwise keep v1 focused on layoffs, hiring, and discussion trends.

### D. Housing (`房子`) module

- Create a new housing route and homepage summary block.
- v1 scope:
  - mortgage/rate watch
  - Bay Area rent vs buy snapshot
  - selected local housing headlines
  - practical homeowner/renter decision notes
- Do not build full listings search in v1; keep this as a decision layer, not a Zillow clone.

### E. Dining (`吃喝`) improvements

- Keep the current 4-category model, but improve usefulness over quantity:
  - stronger `why pick this today` tags
  - open-now and distance prominence
  - commute-friendly and group-dinner tags
  - `new and worth trying` vs `safe default` distinction
- Add saved preferences:
  - preferred cities
  - radius
  - party size
  - budget
- Add lightweight list actions:
  - save for later
  - open maps
  - copy to group chat
- Keep map support optional; prioritize card usefulness and ranking quality first.

### F. Deals and community

- Separate `practical savings` from `social gossip`.
- Deals feed should rank for usefulness first, not novelty:
  - groceries, gas, telecom, delivery, family, travel, electronics
- Community feed should answer `what Bay Area Chinese engineers are discussing that may affect decisions`, not just `what is hot`.
- Add source confidence and post age labels to reduce low-signal forum noise.

### G. Data platform and API changes

- Keep the existing Vercel handler pattern, but add new domain handlers instead of further overloading the current homepage fetch set.
- Introduce or formalize these public interfaces:
  - `GET /api/work/overview`
  - `GET /api/work/discussions`
  - `GET /api/housing/overview`
  - `GET /api/deals/feed`
  - optional `GET /api/home/brief` for a precomputed top-of-page summary
- Extend existing response contracts to include consistent fields:
  - `status`
  - `asOf`
  - `source`
  - `ttlSeconds`
  - `whyItMattersZh`
  - `relevanceScore`
  - `actionability`
- Move more judgment work to scheduled jobs and durable cache layers; avoid increasing request-time aggregation complexity.
- Replace purely in-memory-only critical caches with durable cache/KV for the modules that define the homepage experience.
- Standardize source adapters and normalization types under shared interfaces so new modules do not duplicate parsing logic.

### H. Design, usability, and trust

- Preserve the data-punk identity, but make it more intentional and less visually noisy.
- Tighten typography hierarchy so users can scan `headline -> why it matters -> action` in one glance.
- Add visible trust signals:
  - source attribution
  - freshness
  - stale state
  - fallback state
- Improve first-time-user onboarding:
  - optional location setup
  - optional portfolio setup
  - optional module preference selection
- Add SEO and sharing basics:
  - better title/description/open graph
  - route-level metadata for `票子`, `吃喝`, `包裹`, `房子`

### H1. Visual system overhaul

- Refine the existing dark theme into a disciplined section-based palette:
  - `票子`: cyan/blue
  - `包裹`: amber/orange
  - `吃喝`: gold/warm amber
  - `房子`: green/teal
  - `羊毛/吃瓜`: violet/slate
- Use section color as a navigational cue, not as a decorative fill.
- Reduce always-on neon glow; reserve stronger glow for active, changing, or especially important states.
- Introduce one richer background treatment:
  - subtle radial light fields
  - controlled grid texture
  - section-tinted shadows
- Keep sharp corners for the data-terminal feel, but mix in a small number of larger-radius containers for hero areas so the page does not feel mechanically flat.

### H2. Typography and content presentation

- Strengthen the Chinese-first typographic system:
  - display style for hero and section headlines
  - mono only for numbers, tickers, timestamps, and metadata
  - avoid overusing mono for narrative text
- Make section titles larger and more declarative.
- Add one-line summaries under key module titles so users understand the value immediately.
- Normalize metadata styling for:
  - source
  - freshness
  - location
  - distance
  - confidence

### H3. Motion and interaction polish

- Replace generic fade-ins with purposeful motion:
  - fast load-in for summary layer
  - staggered reveal for ranked modules
  - restrained hover states on desktop
- Add micro-interactions only where they reinforce understanding:
  - number flash on change
  - active nav transition
  - card press depth on mobile
- Avoid perpetual motion; no continuously animated surfaces outside specific live-state indicators.

### H4. Mobile UX refinement

- Design mobile as the primary surface, not a collapsed desktop page.
- Reorder modules for thumb-friendly scanning and reduce first-screen clutter.
- Increase tap target clarity on list rows, category tabs, and external actions.
- Keep critical metrics above the fold:
  - today summary
  - portfolio snapshot
  - one work signal
  - one dining recommendation cluster
- Make horizontal carousels easier to parse by improving card peeking, snap behavior, and edge spacing.

### H5. Trust, status, and state design

- Introduce explicit visual states for every module:
  - live
  - cached
  - stale
  - unavailable
- Give each state its own consistent badge treatment and tone.
- Show source and freshness in the same predictable location across all cards/modules.
- Design skeleton loaders that mirror final layout shape, so loading feels stable instead of jumpy.

### H6. Page-specific design plan

- Homepage:
  - make it feel like a curated briefing, not a component dump
  - prioritize `今日判断` and `票子`
- `票子` page:
  - evolve toward a premium terminal-like personal finance cockpit
  - stronger chart framing, larger numbers, cleaner tables
- `吃喝` page:
  - shift from generic cards to appetite-driven recommendation layouts
  - larger photos, clearer badges, more obvious “why go” signals
- Future `包裹` page:
  - compact briefing aesthetic with urgency coding
- Future `房子` page:
  - calmer, more confidence-driven visual tone than finance, with practical decision cards

### I. Instrumentation and product metrics

- Add analytics events for:
  - section view
  - external link click
  - saved place/deal click
  - login/register completion
  - portfolio setup completion
- Define success metrics:
  - homepage meaningful-content render rate
  - per-module CTR
  - return rate after portfolio setup
  - dining outbound map clicks
  - work/housing engagement after launch
- Add an admin/debug view for source health and cache freshness rather than debugging through logs alone.

## Delivery Plan

### Phase 0: Product and data stabilization

- Standardize copy, freshness labels, empty states, and source attribution across existing modules.
- Normalize API response shapes and remove obvious homepage inconsistency.
- Add analytics and a health dashboard for content freshness.

### Phase 1: Homepage refactor

- Rebuild homepage around `today summary + money + work + food + housing + practical community`.
- Demote entertainment from top-level importance without removing it.
- Expand navigation and route scaffolding.
- Redesign the homepage visual hierarchy, hero layer, and section composition before adding more modules.

### Phase 2: New decision modules

- Launch `包裹` first.
- Launch `房子` second.
- Keep `税` explicitly out of v1 unless a minimal deadlines-and-links version is requested.
- Build each new module with its own section identity and card language, not as cloned homepage blocks.

### Phase 3: Judgment and ranking quality

- Move ranking logic into reusable scoring pipelines.
- Precompute more summaries via cron/background jobs.
- Improve fallback quality and freshness behavior.

### Phase 4: Personalization

- Add saved preferences and module ordering.
- Add user-level defaults for city, radius, holdings, and content density.
- Add `today for me` assembly using stored preferences, but keep page-level explainability.

## Test Plan

- Homepage renders all critical modules with one of: `ok`, `stale`, or `unavailable`, never silent blanks.
- Navigation works across desktop and mobile for the expanded route set.
- Finance module:
  - authenticated user with holdings
  - anonymous user without holdings
  - quote API unavailable
  - stale cache fallback
- Work module:
  - mixed-source merge
  - empty source fallback
  - relevance scoring keeps Bay Area engineer topics and suppresses generic noise
- Housing module:
  - rate data present
  - local headline fallback
  - stale state visible
- Dining module:
  - preference changes affect ranking
  - open-now and distance labels remain accurate
  - Maps links work
- Deals/community:
  - expired/low-signal items are filtered
  - duplicate threads do not dominate
- Performance:
  - homepage first meaningful content under acceptable mobile budget
  - no module blocks the entire page
- Observability:
  - freshness timestamps, source labels, and analytics events are emitted for every top-level section
- Design QA:
  - mobile and desktop typography scales feel intentional
  - no section looks visually interchangeable with another
  - hero, cards, and list rows follow the defined component hierarchy
  - skeleton, empty, stale, and error states are visually coherent
  - glow, border, and shadow treatments remain restrained and consistent

## Assumptions and defaults

- Keep the current stack: React/Vite frontend, Vercel serverless backend, existing auth model, and current deployment target.
- Keep Chinese-first UX with English as a secondary language option.
- Keep request-time LLM use limited; new judgment features should be batch-generated and cached where possible.
- Build `包裹` and `房子` before `税`.
- Treat entertainment as secondary to decision support on the homepage.
- Prioritize a designer-led homepage and design-system pass before broad feature expansion; otherwise the product will keep gaining modules faster than it gains clarity.
