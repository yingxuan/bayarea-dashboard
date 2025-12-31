/**
 * Test Yahoo Finance API to verify data correctness
 */

const DATA_API_URL = 'https://forge.manus.im';
const DATA_API_KEY = process.env.VITE_FRONTEND_FORGE_API_KEY || '';

async function callDataApi(apiPath, params) {
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

async function getStockQuote(symbol) {
  try {
    console.log(`\n=== Fetching ${symbol} ===`);
    const response = await callDataApi('YahooFinance/get_stock_chart', {
      query: {
        symbol,
        region: 'US',
        interval: '1d',
        range: '5d',
        includeAdjustedClose: true,
      },
    });

    console.log('Full API Response:');
    console.log(JSON.stringify(response, null, 2));

    if (!response?.chart?.result?.[0]) {
      console.error(`No data found for symbol: ${symbol}`);
      return null;
    }

    const result = response.chart.result[0];
    const meta = result.meta;
    
    console.log('\nMeta data:');
    console.log(JSON.stringify(meta, null, 2));
    
    // Calculate change and change percent
    const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
    const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    const quote = {
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

    console.log('\nParsed Quote:');
    console.log(JSON.stringify(quote, null, 2));

    return quote;
  } catch (error) {
    console.error(`Error fetching stock quote for ${symbol}:`, error);
    return null;
  }
}

// Test SPY, Gold, and BTC
async function main() {
  console.log('Testing Yahoo Finance API...\n');
  
  await getStockQuote('SPY');
  await getStockQuote('GC=F');
  await getStockQuote('BTC-USD');
}

main().catch(console.error);
