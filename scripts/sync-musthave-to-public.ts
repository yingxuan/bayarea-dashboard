import { mkdir, copyFile, access } from 'node:fs/promises';
import path from 'path';

const SOURCE_DIR = path.join(process.cwd(), 'data', 'spend');
const TARGET_DIR = path.join(process.cwd(), 'client', 'public', 'data');

const FILES_TO_COPY = [
  'musthave.placeids.json',
  '中餐.musthave.json',
  '夜宵.musthave.json',
  '奶茶.musthave.json',
  '新店打卡.musthave.json',
];

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(TARGET_DIR, { recursive: true });
  for (const filename of FILES_TO_COPY) {
    const src = path.join(SOURCE_DIR, filename);
    const dest = path.join(TARGET_DIR, filename);
    if (!(await exists(src))) {
      console.warn(`[sync-musthave] source missing ${src}`);
      continue;
    }
    await copyFile(src, dest);
    console.log(`[sync-musthave] copied ${filename}`);
  }
}

main().catch((error) => {
  console.error('[sync-musthave] failed', error);
  process.exit(1);
});
