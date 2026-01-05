/**
 * Seed Generation Helper Script
 * 
 * Generates seed data from CSV or plain text lists.
 * Automatically creates Google Maps search URLs from name + city.
 * 
 * Usage:
 *   # From CSV
 *   npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input bubble-tea.csv
 *   
 *   # From plain text (one per line: "name | city | tags")
 *   npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input list.txt --format text
 *   
 *   # Merge with existing seeds
 *   npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input new-items.csv --merge
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SeedFile, SeedPlace, SeedCategory } from '../shared/types/seeds';

const SEEDS_DIR = join(process.cwd(), 'client', 'src', 'lib', 'seeds', 'southbay');
const MIN_ITEMS = 80;

interface GenerateOptions {
  category: SeedCategory;
  input: string;
  format?: 'csv' | 'text';
  merge?: boolean;
  outputFile?: string;
}

function generateSearchUrl(name: string, city: string): string {
  const query = `${name} ${city} CA`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function parseCSV(content: string): SeedPlace[] {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const seeds: SeedPlace[] = [];

  // Skip header if present
  let startIndex = 0;
  if (lines[0]?.toLowerCase().includes('category') || lines[0]?.toLowerCase().includes('name')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV format: category,name,city,tags (tags optional)
    const parts = line.split(',').map((p) => p.trim());
    
    if (parts.length < 3) {
      console.warn(`Skipping line ${i + 1}: insufficient columns (need at least: name, city)`);
      continue;
    }

    const [category, name, city, ...tagParts] = parts;
    const tags = tagParts.length > 0 ? tagParts.join(',').split(',').map((t) => t.trim()) : undefined;

    if (!name || !city) {
      console.warn(`Skipping line ${i + 1}: missing name or city`);
      continue;
    }

    const query = `${name} ${city} CA`;
    seeds.push({
      name,
      city,
      mapsUrl: generateSearchUrl(name, city),
      mapsType: 'search',
      query,
      categoryTags: tags,
    });
  }

  return seeds;
}

function parseTextList(content: string): SeedPlace[] {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const seeds: SeedPlace[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Format: "name | city | tags" (tags optional)
    const parts = line.split('|').map((p) => p.trim());
    
    if (parts.length < 2) {
      console.warn(`Skipping line ${i + 1}: need at least "name | city"`);
      continue;
    }

    const [name, city, ...tagParts] = parts;
    const tags = tagParts.length > 0 ? tagParts.join('|').split(',').map((t) => t.trim()) : undefined;

    if (!name || !city) {
      console.warn(`Skipping line ${i + 1}: missing name or city`);
      continue;
    }

    const query = `${name} ${city} CA`;
    seeds.push({
      name,
      city,
      mapsUrl: generateSearchUrl(name, city),
      mapsType: 'search',
      query,
      categoryTags: tags,
    });
  }

  return seeds;
}

function loadExistingSeeds(category: SeedCategory): SeedPlace[] {
  const filePath = join(SEEDS_DIR, `${category}.json`);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const seedFile: SeedFile = JSON.parse(content);
    return seedFile.items || [];
  } catch (error) {
    console.warn(`Failed to load existing seeds: ${error}`);
    return [];
  }
}

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

function main() {
  const args = process.argv.slice(2);
  const options: GenerateOptions = {
    category: '奶茶',
    input: '',
    format: 'csv',
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      options.category = args[i + 1] as SeedCategory;
      i++;
    } else if (args[i] === '--input' && args[i + 1]) {
      options.input = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1] as 'csv' | 'text';
      i++;
    } else if (args[i] === '--merge') {
      options.merge = true;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    }
  }

  if (!options.input) {
    console.error('❌ --input required');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input list.csv');
    console.log('  npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input list.txt --format text');
    console.log('  npx tsx scripts/generate-seeds-helper.ts --category 奶茶 --input new.csv --merge');
    process.exit(1);
  }

  // Check if input file exists (try relative to seeds dir first, then cwd)
  let inputPath = options.input;
  if (!existsSync(inputPath)) {
    const seedsInputDir = join(SEEDS_DIR, '_inputs', inputPath);
    if (existsSync(seedsInputDir)) {
      inputPath = seedsInputDir;
    } else {
      console.error(`❌ Input file not found: ${options.input}`);
      process.exit(1);
    }
  }

  console.log(`🌱 Generating seeds for category: ${options.category}`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Format: ${options.format}`);
  console.log(`   Merge: ${options.merge ? 'yes' : 'no'}\n`);

  const content = readFileSync(inputPath, 'utf-8');
  let newSeeds: SeedPlace[] = [];

  if (options.format === 'csv') {
    newSeeds = parseCSV(content);
  } else {
    newSeeds = parseTextList(content);
  }

  if (newSeeds.length === 0) {
    console.error('❌ No seeds generated from input file');
    process.exit(1);
  }

  console.log(`📝 Parsed ${newSeeds.length} items from input\n`);

  // Load existing seeds if merging
  let existingSeeds: SeedPlace[] = [];
  if (options.merge) {
    existingSeeds = loadExistingSeeds(options.category);
    console.log(`📦 Loaded ${existingSeeds.length} existing seeds\n`);
  }

  // Combine and deduplicate
  const allSeeds = [...existingSeeds, ...newSeeds];
  const seen = new Map<string, SeedPlace>();
  
  for (const seed of allSeeds) {
    const normalized = normalizeMapsUrl(seed.mapsUrl);
    if (!seen.has(normalized)) {
      seen.set(normalized, seed);
    }
  }

  const deduped = Array.from(seen.values());
  const duplicatesRemoved = allSeeds.length - deduped.length;

  if (duplicatesRemoved > 0) {
    console.log(`🔍 Deduplicated: ${allSeeds.length} -> ${deduped.length} items (removed ${duplicatesRemoved})\n`);
  }

  // Warn if below minimum
  if (deduped.length < MIN_ITEMS) {
    console.warn(`⚠️  Below minimum: ${deduped.length} items (target: ${MIN_ITEMS})\n`);
  }

  // Create seed file
  const seedFile: SeedFile = {
    version: 1,
    category: options.category,
    region: 'southbay',
    updatedAt: new Date().toISOString(),
    items: deduped,
  };

  // Use explicit file path to avoid encoding issues
  const categoryFileName = options.category + '.json';
  const outputPath = options.outputFile || join(SEEDS_DIR, categoryFileName);
  
  // Write with explicit UTF-8 encoding
  const jsonContent = JSON.stringify(seedFile, null, 2);
  writeFileSync(outputPath, jsonContent, 'utf8');

  console.log(`✅ Generated ${deduped.length} seeds`);
  console.log(`   Output: ${outputPath}\n`);

  console.log('🔍 Run validator:');
  console.log('   npx tsx scripts/validate-seeds.ts\n');
}

main();
