/**
 * Check for duplicates in 奶茶.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { SeedFile } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');

function main() {
  const filePath = join(SEEDS_DIR, '奶茶.json');
  const content = readFileSync(filePath, 'utf-8');
  const seedFile: SeedFile = JSON.parse(content);

  console.log(`📄 奶茶.json: ${seedFile.items.length} total items\n`);

  // Check duplicates by name+city
  const seenByNameCity = new Map<string, number[]>();
  seedFile.items.forEach((item, index) => {
    const key = `${item.name.toLowerCase().trim()}|${item.city.toLowerCase().trim()}`;
    if (!seenByNameCity.has(key)) {
      seenByNameCity.set(key, []);
    }
    seenByNameCity.get(key)!.push(index);
  });

  const dupes = Array.from(seenByNameCity.entries())
    .filter(([_, indices]) => indices.length > 1)
    .map(([key, indices]) => ({ key, indices }));

  console.log(`Unique name+city combinations: ${seenByNameCity.size}`);
  console.log(`Duplicates by name+city: ${dupes.length}\n`);

  if (dupes.length > 0) {
    console.log('Duplicates found:');
    dupes.forEach(({ key, indices }) => {
      const [name, city] = key.split('|');
      console.log(`  "${name}" in "${city}": appears ${indices.length} times at indices ${indices.join(', ')}`);
      indices.forEach(idx => {
        const item = seedFile.items[idx];
        console.log(`    [${idx}] ${item.name} | ${item.city} | ${item.mapsUrl}`);
      });
    });
  } else {
    console.log('✅ No duplicates found by name+city');
  }

  // Check duplicates by mapsUrl
  const seenByUrl = new Map<string, number[]>();
  seedFile.items.forEach((item, index) => {
    if (!seenByUrl.has(item.mapsUrl)) {
      seenByUrl.set(item.mapsUrl, []);
    }
    seenByUrl.get(item.mapsUrl)!.push(index);
  });

  const urlDupes = Array.from(seenByUrl.entries())
    .filter(([_, indices]) => indices.length > 1);

  console.log(`\nUnique URLs: ${seenByUrl.size}`);
  console.log(`Duplicates by URL: ${urlDupes.length}`);

  if (urlDupes.length > 0) {
    console.log('\nURL duplicates:');
    urlDupes.forEach(([url, indices]) => {
      console.log(`  ${url}: appears ${indices.length} times at indices ${indices.join(', ')}`);
      indices.forEach(idx => {
        const item = seedFile.items[idx];
        console.log(`    [${idx}] ${item.name} | ${item.city}`);
      });
    });
  }
}

main();
