/**
 * Local API Testing Script
 * Tests Vercel serverless functions locally without deployment
 * 
 * Usage: pnpm tsx scripts/test-local-api.ts
 */

import marketHandler from '../api/market.js';
import aiNewsHandler from '../api/ai-news.js';

// Mock Vercel Request/Response
function createMockRequest(query: Record<string, string> = {}) {
  return {
    method: 'GET',
    url: '/api/test',
    query,
    headers: {},
    body: undefined,
  } as any;
}

function createMockResponse() {
  let statusCode = 200;
  let responseData: any = null;
  const headers: Record<string, string> = {};

  return {
    status: (code: number) => ({
      json: (data: any) => {
        statusCode = code;
        responseData = data;
        return { statusCode, data: responseData };
      },
      end: () => {
        return { statusCode, data: null };
      },
    }),
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    json: (data: any) => {
      responseData = data;
      return { statusCode, data: responseData };
    },
    end: () => {
      return { statusCode, data: null };
    },
    getData: () => responseData,
    getStatus: () => statusCode,
    getHeaders: () => headers,
  } as any;
}

async function testMarketAPI() {
  console.log('\n=== Testing Market API ===');
  
  const req = createMockRequest({ nocache: '1' });
  const res = createMockResponse();
  
  await marketHandler(req, res);
  
  const data = res.getData();
  const status = res.getStatus();
  
  console.log(`Status: ${status}`);
  
  if (status !== 200) {
    console.error('❌ Market API failed');
    console.error(data);
    return false;
  }
  
  // Verify structure
  const checks = [
    { name: 'Has data object', check: !!data.data },
    { name: 'Has BTC data', check: !!data.data?.btc },
    { name: 'BTC value is number or "Unavailable"', check: typeof data.data?.btc?.value === 'number' || data.data?.btc?.value === 'Unavailable' },
    { name: 'Has SPY data', check: !!data.data?.spy },
    { name: 'SPY value is number or "Unavailable"', check: typeof data.data?.spy?.value === 'number' || data.data?.spy?.value === 'Unavailable' },
    { name: 'Has Gold data', check: !!data.data?.gold },
    { name: 'Powerball is "Unavailable"', check: data.data?.powerball?.value === 'Unavailable' },
    { name: 'Powerball source_url is powerball.com', check: data.data?.powerball?.source_url?.includes('powerball.com') },
    { name: 'Has fetched_at', check: !!data.fetched_at },
    { name: 'cache_hit is false (nocache=1)', check: data.cache_hit === false },
  ];
  
  let passed = 0;
  for (const { name, check } of checks) {
    if (check) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
    }
  }
  
  console.log(`\nPassed: ${passed}/${checks.length}`);
  
  // Show sample data
  if (data.data?.btc) {
    console.log(`\nSample BTC value: ${data.data.btc.value}`);
  }
  if (data.data?.spy) {
    console.log(`Sample SPY value: ${data.data.spy.value}`);
  }
  if (data.data?.gold) {
    console.log(`Sample Gold value: ${data.data.gold.value}`);
  }
  
  return passed === checks.length;
}

async function testAINewsAPI() {
  console.log('\n=== Testing AI News API ===');
  
  const req = createMockRequest({ nocache: '1' });
  const res = createMockResponse();
  
  await aiNewsHandler(req, res);
  
  const data = res.getData();
  const status = res.getStatus();
  
  console.log(`Status: ${status}`);
  
  if (status !== 200) {
    console.error('❌ AI News API failed');
    console.error(data);
    return false;
  }
  
  // Verify structure
  const checks = [
    { name: 'Has news array', check: Array.isArray(data.news) },
    { name: 'Has fetched_at', check: !!data.fetched_at },
    { name: 'cache_hit is false (nocache=1)', check: data.cache_hit === false },
  ];
  
  // If news array is empty, check for debug info
  if (data.news.length === 0) {
    checks.push(
      { name: 'Has debug info when empty', check: !!data.debug },
      { name: 'Has helpful message', check: !!data.message }
    );
    console.log('\n⚠️  News array is empty - checking debug info...');
    if (data.debug) {
      console.log(`Debug: ${JSON.stringify(data.debug, null, 2)}`);
    }
  } else {
    // Verify article structure
    const firstArticle = data.news[0];
    checks.push(
      { name: 'Articles have title', check: !!firstArticle.title },
      { name: 'Articles have url', check: !!firstArticle.url && firstArticle.url.startsWith('https://') },
      { name: 'Articles have source_name', check: !!firstArticle.source_name },
      { name: 'Articles have snippet', check: !!firstArticle.snippet },
      { name: 'Articles have summary_zh', check: !!firstArticle.summary_zh },
      { name: 'Articles have why_it_matters_zh', check: !!firstArticle.why_it_matters_zh },
    );
    
    // Check for stock quote pages
    const hasStockQuotes = data.news.some((article: any) => 
      article.url?.includes('/quote/') || 
      article.url?.includes('/symbol/') || 
      article.url?.includes('/stock/')
    );
    checks.push(
      { name: 'No stock quote pages', check: !hasStockQuotes }
    );
    
    // Check domains
    const allowedDomains = [
      'reuters.com', 'theverge.com', 'arstechnica.com', 'techcrunch.com',
      'wired.com', 'ft.com', 'bloomberg.com', 'wsj.com', 'nytimes.com',
      'cnbc.com', 'biztoc.com', 'engadget.com', 'gizmodo.com', 'zdnet.com',
      'cnet.com', 'venturebeat.com', 'theinformation.com', 'axios.com',
      'businessinsider.com', 'forbes.com'
    ];
    
    const allFromAllowedDomains = data.news.every((article: any) => {
      try {
        const domain = new URL(article.url).hostname.replace('www.', '');
        return allowedDomains.some(d => domain === d || domain.endsWith('.' + d));
      } catch {
        return false;
      }
    });
    
    checks.push(
      { name: 'All articles from allowed domains', check: allFromAllowedDomains }
    );
    
    console.log(`\nFound ${data.news.length} articles`);
    if (data.news.length > 0) {
      console.log(`\nSample article:`);
      console.log(`  Title: ${firstArticle.title}`);
      console.log(`  URL: ${firstArticle.url}`);
      console.log(`  Source: ${firstArticle.source_name}`);
    }
  }
  
  let passed = 0;
  for (const { name, check } of checks) {
    if (check) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
    }
  }
  
  console.log(`\nPassed: ${passed}/${checks.length}`);
  
  return passed === checks.length;
}

async function main() {
  console.log('Starting local API tests...\n');
  
  const marketPassed = await testMarketAPI();
  const newsPassed = await testAINewsAPI();
  
  console.log('\n=== Summary ===');
  console.log(`Market API: ${marketPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`AI News API: ${newsPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (marketPassed && newsPassed) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(console.error);
