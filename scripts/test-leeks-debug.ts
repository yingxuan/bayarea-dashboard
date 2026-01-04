/**
 * Debug script for /api/community/leeks
 * Tests RSS parsing and URL validation in detail
 */

import leeksHandler from '../api/community/leeks.js';

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

async function main() {
  console.log('=== Testing /api/community/leeks with detailed output ===\n');
  
  const req = createMockRequest({ nocache: '1' });
  const res = createMockResponse();
  
  try {
    await leeksHandler(req, res);
    
    const data = res.getData();
    const status = res.getStatus();
    
    console.log(`\n=== Response Status: ${status} ===\n`);
    
    if (status !== 200) {
      console.error('❌ API failed');
      console.error(JSON.stringify(data, null, 2));
      return;
    }
    
    console.log('=== Response Structure ===');
    console.log(`Status: ${data.status}`);
    console.log(`Count: ${data.count}`);
    console.log(`Cache Hit: ${data.cache_hit}`);
    console.log(`Cache Mode: ${data.cache_mode}`);
    console.log(`As Of: ${data.asOf || data.fetched_at}`);
    
    if (data.sources?.['1point3acres']) {
      const source = data.sources['1point3acres'];
      console.log(`\n=== Source Info ===`);
      console.log(`Source Status: ${source.status}`);
      console.log(`Source Reason: ${source.reason || 'N/A'}`);
      console.log(`Source URL: ${source.source?.url || 'N/A'}`);
      console.log(`Items Count: ${source.items?.length || 0}`);
    }
    
    console.log(`\n=== Items (${data.items?.length || 0} total) ===`);
    
    if (data.items && data.items.length > 0) {
      data.items.forEach((item: any, idx: number) => {
        console.log(`\n--- Item ${idx + 1} ---`);
        console.log(`Title: ${item.title}`);
        console.log(`URL: ${item.url}`);
        console.log(`Source: ${item.source || 'N/A'}`);
        console.log(`Source Label: ${item.sourceLabel || 'N/A'}`);
        console.log(`Published At: ${item.publishedAt || 'N/A'}`);
        
        // Validate URL
        const isThread = item.url.includes('thread-') || item.url.includes('viewthread');
        const isNotList = !item.url.includes('/section/') && !item.url.includes('forumdisplay');
        console.log(`✅ Valid Thread URL: ${isThread ? 'YES' : 'NO'}`);
        console.log(`✅ Not List Page: ${isNotList ? 'YES' : 'NO'}`);
        
        if (!isThread || !isNotList) {
          console.log(`⚠️  WARNING: This item may be invalid!`);
        }
      });
    } else {
      console.log('⚠️  No items returned!');
    }
    
    // Show full JSON for inspection
    console.log(`\n=== Full JSON Response ===`);
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

main().catch(console.error);
