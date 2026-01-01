import { searchGoogle } from './server/googleCSE.ts';

console.log('Testing Google CSE API credentials...\n');

try {
  const results = await searchGoogle('SPY price today', 3);
  
  if (results && results.length > 0) {
    console.log('✓ Google CSE API credentials are VALID\n');
    console.log(`Found ${results.length} results for "SPY price today":\n`);
    results.forEach((result, i) => {
      console.log(`${i + 1}. ${result.title}`);
      console.log(`   Source: ${result.displayLink}`);
      console.log(`   URL: ${result.link}\n`);
    });
    process.exit(0);
  } else {
    console.error('✗ No results found - API may be misconfigured');
    process.exit(1);
  }
} catch (error) {
  console.error('✗ Google CSE API test FAILED:');
  console.error(error.message);
  process.exit(1);
}
