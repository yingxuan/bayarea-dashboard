# 湾区码农每日决策仪表盘 (Bay Area Engineer's Daily Decision Dashboard)

**A judgment-based information hub for Chinese software engineers in the SF Bay Area**

---

## Overview

This dashboard is not just a content aggregator—it is a **decision-making tool** that filters and presents the most relevant information about money, work, and life for Bay Area engineers. Built with a cyberpunk-inspired "Data Punk" design aesthetic, it provides high-density information display with intelligent judgment layers.

### Core Philosophy

The dashboard follows three key principles:

1. **Judgment over Aggregation** - Every piece of content is scored and filtered based on relevance to Bay Area engineers
2. **Decision Support** - Information is organized around daily decisions: financial moves, career choices, and lifestyle optimization
3. **Efficiency First** - High information density with mobile-first responsive design for quick decision-making

---

## Features

### 💰 票子 (Finance Module)

**Early Financial Freedom**

- **Portfolio Overview**: Real-time stock market value with today's gains/losses and YTD performance
- **Market Indices**: SPY, Gold, Bitcoin, California mortgage rates, Powerball jackpot
- **Finance Videos**: Curated video content about stock analysis and investment strategies
- **Judgment Layer**: Filters out generic financial advice, prioritizes Bay Area-relevant investment topics

### 📰 Breaking News & Industry News

**Why It Matters**

- **Breaking News**: High-priority news with judgment scores (85-95) explaining why each story matters
- **Industry News**: Tech industry updates with tags (AI, recruitment, salary, cloud computing)
- **Industry Videos**: Video summaries of weekly tech news and salary reports
- **Smart Filtering**: Only shows news that impacts Bay Area engineers' careers or finances

### 🍜 吃喝 (Food & Dining)

**Authentic Chinese Cuisine**

- **Chinese Restaurants**: Distance-sorted recommendations with ratings, price range, and cuisine type
- **Bubble Tea Shops**: Popular boba shops with ratings and locations
- **Location-Aware**: Shows distance from user's location for quick decision-making

### 📺 追剧推荐 (Entertainment)

**Chinese TV Shows & Movies**

- Curated recommendations for popular Chinese dramas and shows
- Ratings and streaming platform information
- Helps maintain cultural connection while living abroad

### 🗣️ 吃瓜 (Community Gossip)

**华人论坛热帖**

- Top discussions from Bay Area Chinese communities
- Topics: layoffs, home buying, interviews, restaurants, education, cars, safety, hiking
- Engagement metrics: comments, views, recency
- Judgment scores prioritize practical, experience-sharing posts

### 💸 薅羊毛 (Money-Saving Deals)

**Today's Best Deals**

- Costco gas discounts, Whole Foods Prime member deals
- Restaurant delivery promotions, telecom family plans
- Travel deals, insurance discounts, electronics sales
- **Expiration Tracking**: Shows time remaining for each deal
- **Dual Scoring**: Usefulness score + discount value score

---

## Technical Architecture

### Frontend Stack

- **React 19** with TypeScript
- **Tailwind CSS 4** with custom Data Punk theme
- **Wouter** for client-side routing
- **shadcn/ui** component library
- **Framer Motion** for animations

### Design System: Data Punk (数据朋克)

Inspired by cyberpunk aesthetics and financial terminals:

- **Color Palette**: Dark background (#0a0e1a) with neon accents (electric blue #00d4ff, green for gains, red for losses)
- **Typography**: JetBrains Mono (monospace) for data, Inter for body text
- **Visual Effects**: Grid backgrounds, glow effects, neon borders, subtle animations
- **Layout**: High information density with asymmetric grid layouts

### Backend Architecture (Production-Ready)

The current implementation uses client-side mock data for demonstration. For production deployment, the following backend architecture is designed:

#### Caching Layer (SQLite/Redis)

```typescript
interface CacheEntry {
  key: string;
  value: any;
  expiry: number;
  category: string;
}
```

**Cache Strategy**:
- Finance data: 5-minute TTL
- News: 15-minute TTL
- Restaurants: 24-hour TTL
- Deals: 1-hour TTL

#### Scheduled Tasks (node-cron)

```typescript
// Every 5 minutes: Update finance data
cron.schedule('*/5 * * * *', updateFinanceData);

// Every 15 minutes: Fetch breaking news
cron.schedule('*/15 * * * *', fetchBreakingNews);

// Every hour: Update deals
cron.schedule('0 * * * *', updateDeals);

// Daily at 6 AM: Refresh restaurant data
cron.schedule('0 6 * * *', refreshRestaurants);
```

#### Judgment Layer

**Scoring Algorithm**:

```typescript
interface JudgmentScore {
  relevance: number;    // 0-100: How relevant to Bay Area engineers
  urgency: number;      // 0-100: Time sensitivity
  impact: number;       // 0-100: Potential impact on decisions
  final: number;        // Weighted average
}
```

**Filtering Rules**:
- Finance: Must mention tech stocks, Bay Area real estate, or investment strategies
- News: Must be about tech industry, employment, or local Bay Area topics
- Deals: Must be available in Bay Area and provide significant value (>$20 or >15% off)
- Gossip: Must have >50 comments or >1000 views to indicate community interest

---

## API Design (Production)

### Finance Endpoints

```
GET /api/finance/overview
GET /api/finance/videos
```

### News Endpoints

```
GET /api/news/breaking
GET /api/news/industry
GET /api/news/videos
```

### Food Endpoints

```
GET /api/food/restaurants?lat={lat}&lng={lng}
GET /api/food/bubble-tea?lat={lat}&lng={lng}
```

### Entertainment Endpoints

```
GET /api/entertainment/shows
```

### Community Endpoints

```
GET /api/community/gossip
GET /api/community/deals
```

---

## Development

### Prerequisites

- Node.js 22.13.0
- pnpm 10.4.1

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Project Structure

```
bayarea-dashboard/
├── client/
│   ├── public/          # Static assets
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── lib/         # Utilities and mock data
│   │   ├── App.tsx      # App entry point
│   │   └── index.css    # Global styles (Data Punk theme)
├── server/
│   ├── index.ts         # Express server
│   ├── api.ts           # API routes (for production)
│   ├── cache.ts         # SQLite cache manager (for production)
│   ├── scheduler.ts     # Scheduled tasks (for production)
│   └── mockData.ts      # Mock data generators (for production)
├── DESIGN.md            # Product structure and technical design
├── ideas.md             # Design brainstorming
└── README.md            # This file
```

---

## Mobile Responsiveness

The dashboard is built with a **mobile-first** approach:

- **Breakpoints**: 
  - Mobile: < 640px
  - Tablet: 640px - 1024px
  - Desktop: > 1024px

- **Responsive Features**:
  - Navigation collapses to hamburger menu on mobile
  - Grid layouts adapt from 3-4 columns to 1-2 columns
  - Font sizes and spacing scale appropriately
  - Touch-friendly tap targets (minimum 44x44px)

---

## Data Sources (Production Integration)

### Finance Data
- **Yahoo Finance API**: Stock prices, market indices
- **Coinbase API**: Cryptocurrency prices
- **Freddie Mac API**: Mortgage rates
- **Powerball API**: Lottery jackpot

### News Sources
- **NewsAPI**: Breaking tech news
- **TechCrunch API**: Industry news
- **YouTube Data API**: Video content

### Restaurant Data
- **Google Places API**: Restaurant information, ratings, locations
- **Yelp Fusion API**: Additional reviews and ratings

### Community Data
- **Reddit API**: r/bayarea, r/cscareerquestions
- **华人论坛 API**: huaren.us discussions
- **一亩三分地 API**: 1point3acres.com posts

### Deals Sources
- **Slickdeals API**: Deal aggregation
- **RetailMeNot API**: Coupon codes
- **Custom scrapers**: Costco, Whole Foods, local promotions

---

## Future Enhancements

### Phase 2 Features

1. **User Personalization**
   - Save favorite restaurants and deals
   - Customize module visibility and order
   - Set location for distance calculations

2. **Real-time Updates**
   - WebSocket connections for live stock prices
   - Push notifications for breaking news
   - Deal expiration alerts

3. **Advanced Filtering**
   - Filter news by tags (AI, recruitment, salary)
   - Filter restaurants by cuisine type and price range
   - Filter deals by category and minimum value

4. **Social Features**
   - Comment on gossip posts
   - Share deals with friends
   - Rate restaurant recommendations

5. **Analytics Dashboard**
   - Track portfolio performance over time
   - Visualize market trends
   - Monitor deal savings

### Phase 3 Features

1. **AI-Powered Judgment**
   - Use LLM to analyze news relevance
   - Generate personalized summaries
   - Predict deal value based on user history

2. **Multi-language Support**
   - Full English translation option
   - Bilingual content display

3. **Native Mobile Apps**
   - iOS and Android apps
   - Offline mode with cached data
   - Native push notifications

---

## Performance Optimization

### Current Optimizations

- **Code Splitting**: Dynamic imports for route-based splitting
- **Image Optimization**: WebP format with lazy loading
- **CSS Optimization**: Tailwind CSS purging for minimal bundle size
- **Caching**: Browser caching for static assets

### Production Optimizations

- **CDN**: CloudFlare for global content delivery
- **Database Indexing**: Indexes on cache keys and expiry times
- **API Rate Limiting**: Prevent abuse and ensure fair usage
- **Compression**: Gzip/Brotli compression for all responses

---

## Security Considerations

### Current Implementation

- **No User Data**: Static frontend with no user authentication
- **HTTPS Only**: All external API calls use HTTPS
- **Content Security Policy**: Strict CSP headers

### Production Security

- **API Key Management**: Environment variables for all API keys
- **Rate Limiting**: Per-IP rate limits on all endpoints
- **Input Validation**: Sanitize all user inputs
- **CORS**: Whitelist allowed origins
- **SQL Injection Prevention**: Parameterized queries only

---

## Deployment

### Static Hosting (Current)

The current version can be deployed to:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront

### Full-Stack Deployment (Production)

For production with backend:
- **Frontend**: Vercel/Netlify
- **Backend**: Railway/Render/Fly.io
- **Database**: SQLite (file-based) or Redis (hosted)
- **Scheduled Tasks**: Node.js process with node-cron

---

## License

MIT License - Feel free to use this project for personal or commercial purposes.

---

## Credits

**Design & Development**: Manus AI

**Design Inspiration**: 
- Cyberpunk 2077 UI
- Bloomberg Terminal
- Robinhood App
- 一亩三分地 (1point3acres.com)

**Special Thanks**:
- Bay Area Chinese engineer community
- Open source contributors
- shadcn/ui component library

---

## Contact & Support

For questions, suggestions, or bug reports, please open an issue on GitHub or contact the development team.

**Built with ❤️ for Bay Area engineers**
