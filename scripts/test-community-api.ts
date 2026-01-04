/**
 * Local Community API Testing Script
 * Tests /api/community/leeks and /api/community/gossip locally
 * 
 * Usage: pnpm tsx scripts/test-community-api.ts
 */

import leeksHandler from '../api/community/leeks.js';
import gossipHandler from '../api/community/gossip.js';

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

async function testLeeksAPI() {
  console.log('\n=== Testing /api/community/leeks (市场热点) ===');
  
  const req = createMockRequest({ nocache: '1' });
  const res = createMockResponse();
  
  try {
    await leeksHandler(req, res);
    
    const data = res.getData();
    const status = res.getStatus();
    
    console.log(`Status: ${status}`);
    
    if (status !== 200) {
      console.error('❌ Leeks API failed');
      console.error(data);
      return false;
    }
    
    // Verify structure
    const checks = [
      { name: 'Has status', check: !!data.status },
      { name: 'Status is "ok"', check: data.status === 'ok' },
      { name: 'Has sources', check: !!data.sources },
      { name: 'Has 1point3acres source', check: !!data.sources?.['1point3acres'] },
      { name: 'Has items array', check: Array.isArray(data.items) },
      { name: 'Items count >= 3', check: (data.items?.length || 0) >= 3 },
      { name: 'Has count field', check: typeof data.count === 'number' },
    ];
    
    // Check items structure
    if (data.items && data.items.length > 0) {
      const firstItem = data.items[0];
      checks.push(
        { name: 'Items have title', check: !!firstItem.title },
        { name: 'Items have url', check: !!firstItem.url && firstItem.url.startsWith('http') },
        { name: 'Items have source', check: firstItem.source === '1point3acres' },
        { name: 'Items have sourceLabel', check: firstItem.sourceLabel === '一亩三分地' },
        { name: 'URL is thread URL', check: firstItem.url.includes('thread-') || firstItem.url.includes('viewthread') },
        { name: 'URL is NOT section/forum list', check: !firstItem.url.includes('/section/') && !firstItem.url.includes('forumdisplay') },
      );
      
      console.log(`\nFound ${data.items.length} items`);
      console.log(`\nSample items:`);
      data.items.slice(0, 3).forEach((item: any, idx: number) => {
        console.log(`  ${idx + 1}. ${item.title}`);
        console.log(`     URL: ${item.url}`);
        console.log(`     Valid thread: ${item.url.includes('thread-') || item.url.includes('viewthread') ? '✅' : '❌'}`);
      });
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
  } catch (error) {
    console.error('❌ Error testing leeks API:', error);
    return false;
  }
}

async function testGossipAPI() {
  console.log('\n=== Testing /api/community/gossip (吃瓜) ===');
  
  const req = createMockRequest({ nocache: '1' });
  const res = createMockResponse();
  
  try {
    await gossipHandler(req, res);
    
    const data = res.getData();
    const status = res.getStatus();
    
    console.log(`Status: ${status}`);
    
    if (status !== 200) {
      console.error('❌ Gossip API failed');
      console.error(data);
      return false;
    }
    
    // Verify structure
    const checks = [
      { name: 'Has status', check: !!data.status },
      { name: 'Status is "ok"', check: data.status === 'ok' },
      { name: 'Has sources', check: !!data.sources },
      { name: 'Has 1point3acres source', check: !!data.sources?.['1point3acres'] },
      { name: 'Has blind source', check: !!data.sources?.blind },
    ];
    
    // Check 1point3acres source
    const source1P3A = data.sources?.['1point3acres'];
    if (source1P3A) {
      checks.push(
        { name: '1P3A has items', check: Array.isArray(source1P3A.items) },
        { name: '1P3A items >= 3', check: (source1P3A.items?.length || 0) >= 3 },
        { name: '1P3A has source field', check: !!source1P3A.source },
        { name: '1P3A has status field', check: !!source1P3A.status },
      );
      
      if (source1P3A.items && source1P3A.items.length > 0) {
        const firstItem = source1P3A.items[0];
        checks.push(
          { name: '1P3A items have title', check: !!firstItem.title },
          { name: '1P3A items have url', check: !!firstItem.url && firstItem.url.startsWith('http') },
          { name: '1P3A URL is thread URL', check: firstItem.url.includes('thread-') || firstItem.url.includes('viewthread') },
          { name: '1P3A URL is NOT section/forum list', check: !firstItem.url.includes('/section/') && !firstItem.url.includes('forumdisplay') },
        );
      }
    }
    
    // Check blind source
    const sourceBlind = data.sources?.blind;
    if (sourceBlind) {
      checks.push(
        { name: 'Blind has items', check: Array.isArray(sourceBlind.items) },
        { name: 'Blind items >= 3', check: (sourceBlind.items?.length || 0) >= 3 },
        { name: 'Blind has source field', check: !!sourceBlind.source },
        { name: 'Blind has status field', check: !!sourceBlind.status },
      );
      
      if (sourceBlind.items && sourceBlind.items.length > 0) {
        const firstItem = sourceBlind.items[0];
        checks.push(
          { name: 'Blind items have title', check: !!firstItem.title },
          { name: 'Blind items have url', check: !!firstItem.url && firstItem.url.startsWith('http') },
          { name: 'Blind URL is NOT /trending', check: !firstItem.url.includes('/trending') },
        );
      }
    }
    
    console.log(`\n1point3acres: ${source1P3A?.items?.length || 0} items`);
    if (source1P3A?.items && source1P3A.items.length > 0) {
      console.log(`\nSample 1P3A items:`);
      source1P3A.items.slice(0, 2).forEach((item: any, idx: number) => {
        console.log(`  ${idx + 1}. ${item.title}`);
        console.log(`     URL: ${item.url}`);
      });
    }
    
    console.log(`\nBlind: ${sourceBlind?.items?.length || 0} items`);
    if (sourceBlind?.items && sourceBlind.items.length > 0) {
      console.log(`\nSample Blind items:`);
      sourceBlind.items.slice(0, 2).forEach((item: any, idx: number) => {
        console.log(`  ${idx + 1}. ${item.title}`);
        console.log(`     URL: ${item.url}`);
      });
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
  } catch (error) {
    console.error('❌ Error testing gossip API:', error);
    return false;
  }
}

async function main() {
  console.log('Starting local community API tests...\n');
  console.log('Note: This will fetch from RSSHub, so it may take a few seconds...\n');
  
  const leeksPassed = await testLeeksAPI();
  const gossipPassed = await testGossipAPI();
  
  console.log('\n=== Summary ===');
  console.log(`Leeks API (市场热点): ${leeksPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Gossip API (吃瓜): ${gossipPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (leeksPassed && gossipPassed) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(console.error);
