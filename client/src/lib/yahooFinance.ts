/**
 * Yahoo Finance API Integration for Frontend
 * Uses Manus Data API with frontend API key
 */

const DATA_API_URL = import.meta.env.VITE_FRONTEND_FORGE_API_URL || 'https://forge.manus.im';
const DATA_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY || '';

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketCap?: number;
}

/**
 * Call Manus Data API from frontend
 */
async function callDataApi(apiPath: string, params: any): Promise<any> {
  const url = `${DATA_API_URL}/api/v1/data_api/${apiPath}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DATA_API_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Data API error: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get stock quote for a single symbol
 */
export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const response = await callDataApi('YahooFinance/get_stock_chart', {
      query: {
        symbol,
        region: 'US',
        interval: '1d',
        range: '5d',
        includeAdjustedClose: true,
      },
    });

    if (!response?.chart?.result?.[0]) {
      console.error(`No data found for symbol: ${symbol}`);
      return null;
    }

    const result = response.chart.result[0];
    const meta = result.meta;
    
    // Calculate change and change percent
    const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: meta.symbol,
      price: currentPrice,
      change,
      changePercent,
      volume: meta.regularMarketVolume || 0,
      dayHigh: meta.regularMarketDayHigh || currentPrice,
      dayLow: meta.regularMarketDayLow || currentPrice,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || currentPrice,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || currentPrice,
      marketCap: meta.marketCap,
    };
  } catch (error) {
    console.error(`Error fetching stock quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get quotes for multiple symbols
 */
export async function getMultipleStockQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  const quotes: Record<string, StockQuote> = {};
  
  // Fetch all quotes in parallel
  const results = await Promise.allSettled(
    symbols.map(symbol => getStockQuote(symbol))
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      quotes[symbols[index]] = result.value;
    }
  });

  return quotes;
}

/**
 * Get cryptocurrency quote (Bitcoin, Ethereum, etc.)
 */
export async function getCryptoQuote(symbol: string): Promise<StockQuote | null> {
  // Crypto symbols on Yahoo Finance use -USD suffix
  const cryptoSymbol = symbol.includes('-') ? symbol : `${symbol}-USD`;
  return getStockQuote(cryptoSymbol);
}

/**
 * Calculate portfolio value and performance
 */
export interface PortfolioHolding {
  symbol: string;
  shares: number;
  costBasis: number; // Average purchase price per share
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPercent: number;
  dayChange: number;
  dayChangePercent: number;
  holdings: Array<{
    symbol: string;
    shares: number;
    currentPrice: number;
    currentValue: number;
    costBasis: number;
    totalCost: number;
    gain: number;
    gainPercent: number;
    dayChange: number;
    dayChangePercent: number;
  }>;
}

export async function calculatePortfolio(holdings: PortfolioHolding[]): Promise<PortfolioSummary> {
  const symbols = holdings.map(h => h.symbol);
  const quotes = await getMultipleStockQuotes(symbols);

  let totalValue = 0;
  let totalCost = 0;
  let totalDayChange = 0;

  const holdingsWithValues = holdings.map(holding => {
    const quote = quotes[holding.symbol];
    if (!quote) {
      return null;
    }

    const currentValue = quote.price * holding.shares;
    const totalHoldingCost = holding.costBasis * holding.shares;
    const gain = currentValue - totalHoldingCost;
    const gainPercent = totalHoldingCost > 0 ? (gain / totalHoldingCost) * 100 : 0;
    const dayChange = quote.change * holding.shares;
    const dayChangePercent = quote.changePercent;

    totalValue += currentValue;
    totalCost += totalHoldingCost;
    totalDayChange += dayChange;

    return {
      symbol: holding.symbol,
      shares: holding.shares,
      currentPrice: quote.price,
      currentValue,
      costBasis: holding.costBasis,
      totalCost: totalHoldingCost,
      gain,
      gainPercent,
      dayChange,
      dayChangePercent,
    };
  }).filter(Boolean) as PortfolioSummary['holdings'];

  const totalGain = totalValue - totalCost;
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const dayChangePercent = totalValue > 0 ? (totalDayChange / (totalValue - totalDayChange)) * 100 : 0;

  return {
    totalValue,
    totalCost,
    totalGain,
    totalGainPercent,
    dayChange: totalDayChange,
    dayChangePercent,
    holdings: holdingsWithValues,
  };
}
