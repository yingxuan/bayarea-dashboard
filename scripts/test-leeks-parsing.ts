/**
 * Test RSS parsing logic with mock RSSHub response
 * This simulates what RSSHub would return
 */

import { XMLParser } from 'fast-xml-parser';

// Mock RSS XML (typical RSSHub format for 1point3acres)
const mockRSSXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>一亩三分地 - 投资理财</title>
    <link>https://www.1point3acres.com/bbs/forum-400-1.html</link>
    <description>投资理财/市场热点</description>
    <item>
      <title>2024年投资理财讨论</title>
      <link>https://www.1point3acres.com/bbs/thread-123456-1-1.html</link>
      <pubDate>Fri, 03 Jan 2024 12:00:00 GMT</pubDate>
      <description>讨论2024年投资理财策略</description>
    </item>
    <item>
      <title>市场热点分析：科技股走势</title>
      <link>/bbs/thread-123457-1-1.html</link>
      <pubDate>Fri, 03 Jan 2024 11:00:00 GMT</pubDate>
      <description>分析科技股市场走势</description>
    </item>
    <item>
      <title>股票投资讨论</title>
      <link>thread-123458-1-1.html</link>
      <pubDate>Fri, 03 Jan 2024 10:00:00 GMT</pubDate>
      <description>股票投资相关讨论</description>
    </item>
    <item>
      <title>投资理财论坛</title>
      <link>https://www.1point3acres.com/bbs/forum-400-1.html</link>
      <pubDate>Fri, 03 Jan 2024 09:00:00 GMT</pubDate>
      <description>投资理财论坛列表</description>
    </item>
    <item>
      <title>Section 400</title>
      <link>https://www.1point3acres.com/bbs/section/400</link>
      <pubDate>Fri, 03 Jan 2024 08:00:00 GMT</pubDate>
      <description>Section page</description>
    </item>
  </channel>
</rss>`;

/**
 * Strict validation: Only allow thread detail pages
 */
function isValid1p3aThreadUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  
  // Reject any section/forum list pages
  if (urlLower.includes('/section/') ||
      urlLower.includes('forumdisplay') || 
      urlLower.includes('forum.php?mod=forumdisplay') ||
      urlLower.includes('/guide') ||
      urlLower.includes('forum-400') ||
      urlLower.includes('forum-391')) {
    return false;
  }
  
  // STRICT: Only allow these patterns:
  // 1. /bbs/thread-xxxxx-1-1.html (or thread-xxxxx.html)
  // 2. forum.php?mod=viewthread&tid=xxxxx
  // 3. thread-xxxxx (if it's a relative path that will be normalized)
  const hasThreadPattern = (urlLower.includes('/bbs/thread-') || urlLower.includes('thread-')) && 
                           (urlLower.includes('.html') || urlLower.match(/thread-\d+/));
  const hasViewThreadPattern = urlLower.includes('forum.php?mod=viewthread') && urlLower.includes('tid=');
  
  const isValid = hasThreadPattern || hasViewThreadPattern;
  
  if (!isValid) {
    console.log(`[TEST] URL validation failed for: ${url.substring(0, 100)}`);
  }
  
  return isValid;
}

function main() {
  console.log('=== Testing RSS Parsing Logic ===\n');
  
  // Parse XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
  
  const feed = parser.parse(mockRSSXML);
  console.log('✅ RSS XML parsed\n');
  
  // Extract items
  const rssItems = feed?.rss?.channel?.item || feed?.feed?.entry || [];
  const itemsArray = Array.isArray(rssItems) ? rssItems : [rssItems];
  
  console.log(`Found ${itemsArray.length} raw items in RSS\n`);
  
  const validItems: any[] = [];
  
  // Parse each item
  for (let i = 0; i < itemsArray.length; i++) {
    const item = itemsArray[i];
    if (!item) continue;
    
    console.log(`--- Item ${i + 1} ---`);
    console.log(`Raw item structure:`, JSON.stringify({
      hasLink: !!item.link,
      linkType: typeof item.link,
      linkValue: item.link,
      hasTitle: !!item.title,
      titleType: typeof item.title,
      titleValue: item.title,
    }, null, 2));
    
    // Extract link and title
    let link = '';
    if (typeof item.link === 'string') {
      link = item.link;
    } else if (item.link?.['#text']) {
      link = item.link['#text'];
    } else if (item.link?.['@_href']) {
      link = item.link['@_href'];
    } else if (item.link) {
      link = String(item.link);
    }
    
    let title = '';
    if (typeof item.title === 'string') {
      title = item.title;
    } else if (item.title?.['#text']) {
      title = item.title['#text'];
    } else if (item.title) {
      title = String(item.title);
    }
    
    console.log(`Extracted link: "${link}"`);
    console.log(`Extracted title: "${title}"`);
    
    if (!link || !title) {
      console.log(`❌ Skipping: missing link or title\n`);
      continue;
    }
    
    // Normalize URL
    let url = link.trim();
    console.log(`Original URL: "${url}"`);
    
    // Handle relative URLs
    if (!url.startsWith('http')) {
      if (url.startsWith('/')) {
        url = `https://www.1point3acres.com${url}`;
      } else {
        url = `https://www.1point3acres.com/bbs/${url}`;
      }
    }
    
    console.log(`Normalized URL: "${url}"`);
    
    // Validate URL
    const isValid = isValid1p3aThreadUrl(url);
    console.log(`Validation result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (isValid) {
      validItems.push({
        title: title.trim(),
        url,
      });
      console.log(`✅ Added to valid items\n`);
    } else {
      console.log(`❌ Filtered out (not a thread URL)\n`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total items in RSS: ${itemsArray.length}`);
  console.log(`Valid thread items: ${validItems.length}`);
  console.log(`\nValid items:`);
  validItems.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.title}`);
    console.log(`     ${item.url}`);
  });
  
  if (validItems.length < 3) {
    console.log(`\n⚠️  WARNING: Only ${validItems.length} valid items (< 3)`);
  } else {
    console.log(`\n✅ SUCCESS: ${validItems.length} valid items (>= 3)`);
  }
}

main().catch(console.error);
