/**
 * Step 7: Deterministic test script for 1P3A RSS encoding fix
 * 
 * Usage: tsx scripts/test-1p3a-rss.ts
 * 
 * Tests:
 * - https://rsshub.app/1point3acres/section/391
 * - https://rsshub.app/1point3acres/section/394
 * 
 * Prints:
 * - chosenCharset
 * - replacementCount
 * - 5 titles + links
 */

import * as iconv from 'iconv-lite';
import * as he from 'he';
import { XMLParser } from 'fast-xml-parser';

const RSSHUB_URLS = [
  'https://rsshub.app/1point3acres/section/391',
  'https://rsshub.app/1point3acres/section/394',
];

/**
 * Extract charset from Content-Type header
 */
function extractCharsetFromHeader(contentType: string): string | null {
  const match = contentType.match(/charset=([^;]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Extract charset from XML prolog
 */
function extractCharsetFromProlog(xmlBytes: Buffer): string | null {
  const prolog = xmlBytes.slice(0, 200).toString('latin1');
  const match = prolog.match(/encoding\s*=\s*["']([^"']+)["']/i);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Count replacement characters () in text
 */
function countReplacements(text: string, maxLength: number = 2048): number {
  const sample = text.slice(0, maxLength);
  return (sample.match(/\uFFFD/g) || []).length;
}

/**
 * Decode buffer with charset detection and fallback
 */
function decodeWithCharsetDetection(
  buffer: Buffer,
  contentType: string
): { text: string; chosenCharset: string; replacementCount: number } {
  // Step 1: charset from content-type header
  const headerCharset = extractCharsetFromHeader(contentType);
  
  // Step 2: charset from XML prolog
  const prologCharset = extractCharsetFromProlog(buffer);
  
  // Try header charset first, then prolog, then default to utf-8
  let primaryCharset = headerCharset || prologCharset || 'utf-8';
  
  // Normalize charset names
  if (primaryCharset === 'gbk' || primaryCharset === 'gb2312') {
    primaryCharset = 'gb18030';
  }
  
  // Decode with primary charset
  let decoded = iconv.decode(buffer, primaryCharset);
  let replacementCount = countReplacements(decoded);
  
  // Step 3: If ANY '' appears, compare utf-8 and gb18030
  if (replacementCount > 0) {
    const utf8Decoded = iconv.decode(buffer, 'utf-8');
    const utf8Replacements = countReplacements(utf8Decoded);
    
    const gb18030Decoded = iconv.decode(buffer, 'gb18030');
    const gb18030Replacements = countReplacements(gb18030Decoded);
    
    // Pick the one with fewer replacements
    if (utf8Replacements < replacementCount && utf8Replacements < gb18030Replacements) {
      decoded = utf8Decoded;
      replacementCount = utf8Replacements;
      primaryCharset = 'utf-8';
    } else if (gb18030Replacements < replacementCount) {
      decoded = gb18030Decoded;
      replacementCount = gb18030Replacements;
      primaryCharset = 'gb18030';
    }
  }
  
  return { text: decoded, chosenCharset: primaryCharset, replacementCount };
}

/**
 * Extract text from node (handle string/#text/__cdata)
 */
function pickText(node: any): string {
  if (typeof node === 'string') {
    return node;
  }
  if (node && typeof node === 'object') {
    if (node['#text']) {
      return String(node['#text']);
    }
    if (node['__cdata']) {
      return String(node['__cdata']);
    }
    return String(node);
  }
  return '';
}

/**
 * Clean text (decode entities, strip BOM/zero-width)
 */
function cleanText(text: string): string {
  let cleaned = he.decode(text);
  cleaned = cleaned.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');
  return cleaned.trim();
}

async function testRSSHub(url: string) {
  console.log(`\n=== Testing: ${url} ===\n`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status} ${response.statusText}`);
      return;
    }
    
    const contentType = response.headers.get('content-type') || 'unknown';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Decode with charset detection
    const { text: xmlText, chosenCharset, replacementCount } = decodeWithCharsetDetection(
      buffer,
      contentType
    );
    
    console.log(`✅ Chosen charset: ${chosenCharset}`);
    console.log(`✅ Replacement count: ${replacementCount}`);
    
    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      cdataPropName: '__cdata',
    });
    
    const feed = parser.parse(xmlText);
    const rssItems = feed?.rss?.channel?.item || feed?.feed?.entry || [];
    const itemsArray = Array.isArray(rssItems) ? rssItems : [rssItems];
    
    console.log(`✅ Parsed ${itemsArray.length} items\n`);
    
    // Extract and print first 5 titles + links
    for (let i = 0; i < Math.min(5, itemsArray.length); i++) {
      const item = itemsArray[i];
      const title = cleanText(pickText(item.title));
      let link = '';
      if (item.link?.['@_href']) {
        link = String(item.link['@_href']);
      } else {
        link = pickText(item.link);
      }
      
      console.log(`${i + 1}. ${title}`);
      console.log(`   ${link}\n`);
    }
    
    // Acceptance criteria
    if (replacementCount === 0 || replacementCount < 5) {
      console.log(`✅ PASS: replacementCount is ${replacementCount} (acceptable)`);
    } else {
      console.log(`❌ FAIL: replacementCount is ${replacementCount} (too high)`);
    }
    
    const allTitlesReadable = itemsArray.slice(0, 5).every(item => {
      const title = cleanText(pickText(item.title));
      return title.length > 0 && !title.includes('');
    });
    
    if (allTitlesReadable) {
      console.log(`✅ PASS: All titles are readable Chinese`);
    } else {
      console.log(`❌ FAIL: Some titles contain garbled characters`);
    }
    
  } catch (error) {
    console.error(`❌ Error:`, error);
  }
}

async function main() {
  console.log('Step 7: Testing 1P3A RSS encoding fix\n');
  
  for (const url of RSSHUB_URLS) {
    await testRSSHub(url);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between requests
  }
  
  console.log('\n=== Test complete ===');
}

main().catch(console.error);
