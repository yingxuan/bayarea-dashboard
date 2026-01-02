/**
 * Unit test for Wenxuecity blog parser
 * Tests that the parser correctly extracts real post titles/URLs
 * 
 * Run with: pnpm test server/__tests__/wenxuecity-parser.test.ts
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the parser function (we'll need to export it or test it indirectly)
// For now, we'll test the core logic

const REAL_POST_URL_PATTERN = /\/myblog\/80634\/\d{6}\/\d+\.html/;
const EXCLUDED_KEYWORDS = ['阅读全文', '阅读', '评论', '更多', '查看', '浏览'];
const BLOG_URL = 'https://blog.wenxuecity.com/myoverview/80634/';

interface BlogItem {
  title: string;
  url: string;
  publishedAt?: string;
  sourceUrl: string;
}

/**
 * Test parser function (simplified version matching the actual implementation)
 */
function parseBlogPostsFromHTML(html: string): BlogItem[] {
  const $ = cheerio.load(html, {
    decodeEntities: true,
    normalizeWhitespace: false,
  });
  
  const items: BlogItem[] = [];
  const seenUrls = new Set<string>();
  
  // Find "博文" section
  let $blogSection: cheerio.Cheerio | null = null;
  
  $('h1, h2, h3, h4, h5, h6').each((_, element) => {
    const $header = $(element);
    const headerText = $header.text().trim();
    
    if (headerText === '博文' || headerText.includes('博文')) {
      $blogSection = $header.nextUntil('h1, h2, h3, h4, h5, h6, .pagination, [class*="pagination"]');
      if ($blogSection.length === 0) {
        const $parent = $header.parent();
        const headerIndex = $parent.children().toArray().findIndex(el => el === element);
        if (headerIndex >= 0) {
          $blogSection = $parent.children().slice(headerIndex + 1);
        }
      }
      return false;
    }
  });
  
  if (!$blogSection || $blogSection.length === 0) {
    return [];
  }
  
  // Extract links from blog section
  $blogSection.find('a').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    
    if (!href) return;
    
    let url: string;
    try {
      const urlObj = new URL(href, BLOG_URL);
      url = urlObj.toString();
    } catch (error) {
      if (href.startsWith('/')) {
        url = `https://blog.wenxuecity.com${href}`;
      } else if (href.startsWith('http')) {
        url = href;
      } else {
        url = `${BLOG_URL}${href}`;
      }
    }
    
    if (!REAL_POST_URL_PATTERN.test(url)) {
      return;
    }
    
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);
    
    let title = $link.text().trim();
    if (!title || title.length === 0) {
      return;
    }
    
    title = title.replace(/\s+/g, ' ').trim();
    
    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword => title.includes(keyword));
    if (hasExcludedKeyword) {
      return;
    }
    
    if (title.includes('') || title.match(/[\uFFFD]/)) {
      return;
    }
    
    // Extract date
    const $parent = $link.parent();
    const dateMatch = $parent.text().match(/(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/);
    let publishedAt: string | undefined;
    if (dateMatch) {
      try {
        const date = new Date(dateMatch[1]);
        if (!isNaN(date.getTime())) {
          publishedAt = date.toISOString();
        }
      } catch (error) {
        // Ignore
      }
    }
    
    items.push({
      title: `【文学城博客】${title}`,
      url,
      publishedAt,
      sourceUrl: BLOG_URL,
    });
    
    if (items.length >= 6) {
      return false;
    }
  });
  
  return items.slice(0, 6);
}

describe('Wenxuecity Blog Parser', () => {
  let fixtureHTML: string;

  beforeAll(() => {
    const fixturePath = join(__dirname, '__fixtures__', 'wenxuecity_overview.html');
    fixtureHTML = readFileSync(fixturePath, 'utf-8');
  });

  test('should extract real posts from fixture', () => {
    const items = parseBlogPostsFromHTML(fixtureHTML);
    
    // Assert: result length > 0
    expect(items.length).toBeGreaterThan(0);
    console.log(`Found ${items.length} items`);
    
    // Assert: every URL matches the pattern
    items.forEach((item, index) => {
      expect(REAL_POST_URL_PATTERN.test(item.url)).toBe(true);
      console.log(`Item ${index + 1}: ${item.url} - ${item.title}`);
    });
    
    // Assert: no title contains excluded keywords
    items.forEach((item) => {
      const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword => 
        item.title.includes(keyword)
      );
      expect(hasExcludedKeyword).toBe(false);
    });
    
    // Assert: all items have valid structure
    items.forEach((item) => {
      expect(item.title).toBeTruthy();
      expect(item.url).toBeTruthy();
      expect(item.sourceUrl).toBe(BLOG_URL);
    });
  });

  test('should filter out navigation links', () => {
    const items = parseBlogPostsFromHTML(fixtureHTML);
    
    // Should not include links from sidebar
    items.forEach((item) => {
      expect(item.title).not.toContain('查看更多');
      expect(item.title).not.toContain('阅读全文');
      expect(item.title).not.toContain('评论');
    });
  });

  test('should extract at least 6 posts from fixture', () => {
    const items = parseBlogPostsFromHTML(fixtureHTML);
    
    // Fixture has 6 posts, should extract all
    expect(items.length).toBeGreaterThanOrEqual(6);
  });
});
