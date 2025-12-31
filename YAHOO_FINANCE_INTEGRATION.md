# Yahoo Finance API Integration

## Overview

The Bay Area Engineer's Dashboard now features **real-time stock market data** powered by Yahoo Finance through the Manus Data API. This integration provides live updates for portfolio tracking, market indices, and financial decision-making.

## Features

### Real-Time Data Updates

- **Portfolio Tracking**: Live stock prices for AAPL, GOOGL, MSFT, NVDA, TSLA
- **Market Indices**: S&P 500 (SPY), Gold, Bitcoin, Treasury rates
- **Automatic Refresh**: Data updates every 5 minutes
- **Performance Metrics**: Day change, total gain/loss, YTD performance

### Data Sources

All financial data is fetched from **Yahoo Finance** via the Manus Data API:

- **Stock Quotes**: Current price, daily change, volume, 52-week high/low
- **Cryptocurrency**: Bitcoin and other crypto prices
- **Commodities**: Gold futures (GC=F)
- **Treasury Rates**: 10-year treasury (^TNX) for mortgage rate calculations

## Implementation

### Frontend Architecture

The integration is implemented entirely in the frontend using the Manus Data API client:

```typescript
// client/src/lib/yahooFinance.ts
- getStockQuote(symbol): Fetch single stock quote
- getMultipleStockQuotes(symbols): Fetch multiple quotes in parallel
- getCryptoQuote(symbol): Fetch cryptocurrency prices
- calculatePortfolio(holdings): Calculate portfolio value and performance
```

### API Configuration

The system uses environment variables for API authentication:

- `VITE_FRONTEND_FORGE_API_URL`: Manus Data API endpoint
- `VITE_FRONTEND_FORGE_API_KEY`: Frontend API key (auto-injected)

### Portfolio Configuration

The default portfolio is defined in `FinanceOverview.tsx`:

```typescript
const portfolio: PortfolioHolding[] = [
  { symbol: "AAPL", shares: 50, costBasis: 150 },
  { symbol: "GOOGL", shares: 30, costBasis: 120 },
  { symbol: "MSFT", shares: 40, costBasis: 300 },
  { symbol: "NVDA", shares: 20, costBasis: 400 },
  { symbol: "TSLA", shares: 15, costBasis: 200 },
];
```

## Data Flow

1. **Component Mount**: FinanceOverview component loads on page load
2. **API Calls**: Parallel requests to Yahoo Finance for all symbols
3. **Calculation**: Portfolio value, gains/losses, and performance metrics
4. **Display**: Real-time data rendered with Data Punk design
5. **Auto-Refresh**: Data updates every 5 minutes automatically

## Performance Optimizations

### Parallel Fetching

All stock quotes are fetched in parallel using `Promise.allSettled()` to minimize latency:

```typescript
const results = await Promise.allSettled(
  symbols.map(symbol => getStockQuote(symbol))
);
```

### Error Handling

- Individual stock failures don't break the entire portfolio
- Fallback values ensure the UI remains functional
- Console logging for debugging API issues

### Caching Strategy

- Frontend: React state caching with 5-minute refresh intervals
- Backend: SQLite cache (ready for future server-side implementation)

## Market Indices

The dashboard tracks these key indices:

| Index | Symbol | Description |
|-------|--------|-------------|
| SPY | SPY | S&P 500 ETF |
| Gold | GC=F | Gold Futures |
| Bitcoin | BTC-USD | Bitcoin Price |
| Treasury | ^TNX | 10-Year Treasury |
| Mortgage | Calculated | CA Jumbo 7/1 ARM |
| Powerball | Static | Current Jackpot |

## Mortgage Rate Calculation

California mortgage rates are calculated using the 10-year treasury rate plus a typical spread:

```typescript
const treasuryRate = indices["^TNX"]?.price || 4.5;
const mortgageRate = (treasuryRate + 2.375) / 100;
```

## Future Enhancements

### Planned Features

1. **User Customization**: Allow users to configure their own portfolio
2. **Historical Charts**: Add price history and performance charts
3. **Alerts**: Price alerts and threshold notifications
4. **More Assets**: Support for options, futures, and international stocks
5. **Portfolio Analysis**: Risk metrics, diversification analysis, sector allocation

### Backend Integration

When upgrading to full-stack:

1. Move API calls to backend for better security
2. Implement server-side caching with Redis
3. Add scheduled tasks for pre-fetching data
4. Store user portfolios in database
5. Add authentication for personalized tracking

## Troubleshooting

### Common Issues

**Issue**: Portfolio shows $0
- **Cause**: API calls are still loading or rate-limited
- **Solution**: Wait a few seconds, data will populate automatically

**Issue**: Some stocks show fallback values
- **Cause**: Yahoo Finance API timeout or symbol not found
- **Solution**: Check symbol format (e.g., "BTC-USD" not "BTC")

**Issue**: Data not refreshing
- **Cause**: Browser tab in background (some browsers throttle timers)
- **Solution**: Bring tab to foreground or refresh manually

### API Limits

The Manus Data API has generous rate limits, but be aware:

- **Rate Limit**: 100 requests per minute per user
- **Timeout**: 10 seconds per request
- **Retry Logic**: Automatic retries with exponential backoff

## Testing

### Manual Testing

1. Open the dashboard
2. Check console for "Fetching real-time stock data" message
3. Verify market indices show current prices
4. Wait for portfolio value to populate (may take 10-15 seconds)
5. Check that values update after 5 minutes

### API Testing

Test individual API calls in browser console:

```javascript
import { getStockQuote } from '@/lib/yahooFinance';

// Test single stock
const apple = await getStockQuote('AAPL');
console.log(apple);

// Test crypto
const btc = await getCryptoQuote('BTC');
console.log(btc);
```

## Credits

- **Data Provider**: Yahoo Finance
- **API Gateway**: Manus Data API
- **Design**: Data Punk cyberpunk aesthetic
- **Framework**: React 19 + TypeScript

## License

This integration is part of the Bay Area Engineer's Dashboard and follows the same MIT license.

---

**Last Updated**: December 30, 2024
**Version**: 1.1.0
**Status**: ✅ Production Ready
