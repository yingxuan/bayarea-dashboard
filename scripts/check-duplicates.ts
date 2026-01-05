/**
 * Check for duplicates in seed files
 * Reports duplicates by name+city combination
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { SeedFile } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const categories: Array<'奶茶' | '中餐' | '夜宵' | '新店打卡'> = ['奶茶', '中餐', '夜宵', '新店打卡'];

function checkDuplicates(category: '奶茶' | '中餐' | '夜宵' | '新店打卡') {
  const filePath = join(SEEDS_DIR, `${category}.json`);
  const content = readFileSync(filePath, 'utf-8');
  const seedFile: SeedFile = JSON.parse(content);

  const seenByNameCity = new Map<string, number[]>();
  const duplicates: Array<{ index: number; name: string; city: string; prevIndices: number[] }> = [];

  seedFile.items.forEach((item, index) => {
    const key = `${item.name.toLowerCase().trim()}|${item.city.toLowerCase().trim()}`;
    if (seenByNameCity.has(key)) {
      const prevIndices = seenByNameCity.get(key)!;
      duplicates.push({
        index,
        name: item.name,
        city: item.city,
        prevIndices,
      });
      prevIndices.push(index);
    } else {
      seenByNameCity.set(key, [index]);
    }
  });

  return duplicates;
}

function main() {
  console.log('🔍 Checking for duplicates in seed files...\n');

  let totalDupes = 0;

  for (const category of categories) {
    const dupes = checkDuplicates(category);
    if (dupes.length > 0) {
      console.log(`📄 ${category}: ${dupes.length} duplicates found`);
      dupes.slice(0, 10).forEach((d) => {
        console.log(`  [${d.index}] ${d.name} in ${d.city} (also at indices: ${d.prevIndices.join(', ')})`);
      });
      if (dupes.length > 10) {
        console.log(`  ... and ${dupes.length - 10} more`);
      }
      totalDupes += dupes.length;
    } else {
      console.log(`📄 ${category}: ✅ No duplicates`);
    }
    console.log('');
  }

  if (totalDupes > 0) {
    console.log(`⚠️  Total duplicates found: ${totalDupes}`);
    console.log('💡 Run: npx tsx scripts/generate-all-seeds.ts to fix');
  } else {
    console.log('✅ No duplicates found!');
  }
}

main();
