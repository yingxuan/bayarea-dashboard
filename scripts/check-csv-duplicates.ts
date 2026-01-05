/**
 * Check for duplicate lines in CSV input files
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay', '_inputs');

function checkCSV(fileName: string) {
  const filePath = join(SEEDS_DIR, fileName);
  const csv = readFileSync(filePath, 'utf-8');
  const lines = csv.split('\n').filter(l => l.trim() && !l.toLowerCase().startsWith('category'));

  const seen = new Map<string, number[]>();
  lines.forEach((line, i) => {
    const key = line.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key)!.push(i + 1);
  });

  const dupes = Array.from(seen.entries())
    .filter(([_, lineNumbers]) => lineNumbers.length > 1)
    .map(([line, lineNumbers]) => ({ line, lineNumbers }));

  console.log(`\n📄 ${fileName}:`);
  console.log(`   Total lines: ${lines.length}`);
  console.log(`   Unique lines: ${seen.size}`);
  console.log(`   Duplicates: ${dupes.length}`);

  if (dupes.length > 0) {
    console.log(`\n   Duplicate lines:`);
    dupes.slice(0, 10).forEach(({ line, lineNumbers }) => {
      console.log(`     Line ${lineNumbers.join(', ')}: ${line.substring(0, 80)}`);
    });
    if (dupes.length > 10) {
      console.log(`     ... and ${dupes.length - 10} more`);
    }
  }

  return dupes.length;
}

function main() {
  console.log('🔍 Checking CSV files for duplicate lines...\n');

  const files = ['bubble-tea.csv', 'chinese.csv', 'late-night.csv', 'new-ish.csv'];
  let totalDupes = 0;

  for (const file of files) {
    totalDupes += checkCSV(file);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total duplicates found: ${totalDupes}`);
  
  if (totalDupes > 0) {
    console.log('\n💡 To fix: Remove duplicate lines from CSV files, then run:');
    console.log('   npx tsx scripts/generate-all-seeds.ts');
  } else {
    console.log('\n✅ No duplicate lines found in CSV files');
  }
}

main();
