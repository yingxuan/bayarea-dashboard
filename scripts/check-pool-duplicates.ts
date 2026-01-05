/**
 * Check for duplicates when pools are combined
 * Restaurant pool = 中餐 + 夜宵 + 新店打卡
 * Cafe pool = 奶茶
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { SeedFile } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');

function normalizeMapsUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname === '/maps/search/' || urlObj.pathname === '/maps') {
      const query = urlObj.searchParams.get('query') || urlObj.searchParams.get('q');
      if (query) {
        const normalizedQuery = decodeURIComponent(query).trim();
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedQuery)}`;
      }
    }
    if (urlObj.pathname.startsWith('/maps/place/')) {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

function loadSeedFile(category: '奶茶' | '中餐' | '夜宵' | '新店打卡'): SeedFile {
  const filePath = join(SEEDS_DIR, `${category}.json`);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function main() {
  console.log('🔍 Checking for duplicates in combined pools...\n');

  // Restaurant pool: 中餐 + 夜宵 + 新店打卡
  const chinese = loadSeedFile('中餐');
  const lateNight = loadSeedFile('夜宵');
  const newPlaces = loadSeedFile('新店打卡');

  const restaurantPool = [...chinese.items, ...lateNight.items, ...newPlaces.items];
  
  console.log('📊 Restaurant Pool (中餐 + 夜宵 + 新店打卡):');
  console.log(`   Total items: ${restaurantPool.length}`);

  // Check duplicates by name+city
  const seenByNameCity = new Map<string, number[]>();
  restaurantPool.forEach((item, index) => {
    const key = `${item.name.toLowerCase().trim()}|${item.city.toLowerCase().trim()}`;
    if (!seenByNameCity.has(key)) {
      seenByNameCity.set(key, []);
    }
    seenByNameCity.get(key)!.push(index);
  });

  const nameCityDupes = Array.from(seenByNameCity.entries())
    .filter(([_, indices]) => indices.length > 1)
    .map(([key, indices]) => ({ key, indices }));

  console.log(`   Unique name+city combinations: ${seenByNameCity.size}`);
  console.log(`   Duplicates by name+city: ${nameCityDupes.length}`);

  if (nameCityDupes.length > 0) {
    console.log('\n   Examples:');
    nameCityDupes.slice(0, 10).forEach(({ key, indices }) => {
      const [name, city] = key.split('|');
      const items = indices.map(i => restaurantPool[i]);
      const categories = items.map(item => {
        if (chinese.items.includes(item as any)) return '中餐';
        if (lateNight.items.includes(item as any)) return '夜宵';
        if (newPlaces.items.includes(item as any)) return '新店打卡';
        return '?';
      });
      console.log(`     ${name} in ${city}: appears in ${categories.join(', ')} (${indices.length} times)`);
    });
  }

  // Check duplicates by mapsUrl
  const seenByUrl = new Map<string, number[]>();
  restaurantPool.forEach((item, index) => {
    const normalized = normalizeMapsUrl(item.mapsUrl);
    if (!seenByUrl.has(normalized)) {
      seenByUrl.set(normalized, []);
    }
    seenByUrl.get(normalized)!.push(index);
  });

  const urlDupes = Array.from(seenByUrl.entries())
    .filter(([_, indices]) => indices.length > 1);

  console.log(`   Unique URLs: ${seenByUrl.size}`);
  console.log(`   Duplicates by URL: ${urlDupes.length}`);

  if (urlDupes.length > 0) {
    console.log('\n   URL duplicates:');
    urlDupes.slice(0, 5).forEach(([url, indices]) => {
      const items = indices.map(i => restaurantPool[i]);
      console.log(`     ${url}`);
      items.forEach(item => {
        console.log(`       - ${item.name} in ${item.city}`);
      });
    });
  }

  // Cafe pool: 奶茶
  const bubbleTea = loadSeedFile('奶茶');
  console.log('\n📊 Cafe Pool (奶茶):');
  console.log(`   Total items: ${bubbleTea.items.length}`);
  console.log(`   Unique name+city: ${new Set(bubbleTea.items.map(i => `${i.name}|${i.city}`)).size}`);
  console.log(`   Unique URLs: ${new Set(bubbleTea.items.map(i => normalizeMapsUrl(i.mapsUrl))).size}`);
}

main();
