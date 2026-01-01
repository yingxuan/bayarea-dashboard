
const ALLOWED_DOMAINS = [
  'reuters.com',
  'theverge.com',
  'arstechnica.com',
  'techcrunch.com',
  'wired.com',
  'ft.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'cnbc.com'
];

function isArticleValid(article: any): boolean {
  const url = article.url?.toLowerCase() || '';
  
  // Reject stock quote pages
  if (url.includes('/quote/') || url.includes('/symbol/') || url.includes('/stock/')) {
    return false;
  }
  
  // Reject finance domains unless explicitly allowed
  if (url.includes('finance.yahoo.com') || url.includes('marketwatch.com')) {
    return false;
  }
  
  // Check allowlist
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    if (!ALLOWED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
      return false;
    }
  } catch (e) {
    return false;
  }
  
  return true;
}

const testCases = [
  { url: 'https://www.reuters.com/technology/ai-news-2024-01-01', expected: true },
  { url: 'https://theverge.com/2024/1/1/new-gadget', expected: true },
  { url: 'https://finance.yahoo.com/quote/AAPL', expected: false },
  { url: 'https://www.marketwatch.com/story/stock-market-today', expected: false },
  { url: 'https://unknown-blog.com/my-opinion', expected: false },
  { url: 'https://techcrunch.com/2024/01/01/startup-funding', expected: true },
  { url: 'https://www.bloomberg.com/news/articles/2024-01-01/economy-update', expected: true },
];

testCases.forEach(tc => {
  const result = isArticleValid(tc);
  console.log(`URL: ${tc.url} | Expected: ${tc.expected} | Result: ${result} | ${result === tc.expected ? 'PASS' : 'FAIL'}`);
});
