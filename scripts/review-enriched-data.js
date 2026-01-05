import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = ['奶茶', '中餐', '夜宵', '新店打卡'];
const basePath = path.join(__dirname, '..', 'client', 'src', 'lib', 'seeds', 'southbay');

console.log('=== Enriched Data Review Report ===\n');

files.forEach(cat => {
  const filePath = path.join(basePath, `${cat}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const total = data.items.length;
  const enriched = data.items.filter(i => i.enrichStatus === 'ok').length;
  const withPlaceId = data.items.filter(i => i.placeId).length;
  const withRating = data.items.filter(i => i.rating && i.rating > 0).length;
  const withPhoto = data.items.filter(i => i.photoName || i.photoReference).length;
  const withGoogleMapsUri = data.items.filter(i => i.googleMapsUri).length;
  
  console.log(`${cat}.json:`);
  console.log(`  总条目: ${total}`);
  console.log(`  ✓ Enriched (ok): ${enriched} (${(enriched/total*100).toFixed(1)}%)`);
  console.log(`  ✓ 有placeId: ${withPlaceId} (${(withPlaceId/total*100).toFixed(1)}%)`);
  console.log(`  ✓ 有rating: ${withRating} (${(withRating/total*100).toFixed(1)}%)`);
  console.log(`  ✓ 有userRatingCount: ${data.items.filter(i => i.userRatingCount && i.userRatingCount > 0).length} (${(data.items.filter(i => i.userRatingCount && i.userRatingCount > 0).length/total*100).toFixed(1)}%)`);
  console.log(`  ✓ 有photo: ${withPhoto} (${(withPhoto/total*100).toFixed(1)}%)`);
  console.log(`  ✓ 有googleMapsUri: ${withGoogleMapsUri} (${(withGoogleMapsUri/total*100).toFixed(1)}%)`);
  
  const missing = data.items.filter(i => !i.enrichStatus);
  if (missing.length > 0) {
    console.log(`  ⚠ 缺少enriched data: ${missing.length} 个条目`);
    missing.slice(0, 10).forEach(i => console.log(`     - ${i.name} (${i.city})`));
    if (missing.length > 10) {
      console.log(`     ... 还有 ${missing.length - 10} 个条目`);
    }
  }
  
  // Check for incomplete enriched data
  const incomplete = data.items.filter(i => i.enrichStatus === 'ok' && (!i.placeId || !i.rating || !i.userRatingCount));
  if (incomplete.length > 0) {
    console.log(`  ⚠ 不完整的enriched data: ${incomplete.length} 个条目`);
    incomplete.slice(0, 5).forEach(i => {
      const missing = [];
      if (!i.placeId) missing.push('placeId');
      if (!i.rating) missing.push('rating');
      if (!i.userRatingCount) missing.push('userRatingCount');
      console.log(`     - ${i.name}: 缺少 ${missing.join(', ')}`);
    });
  }
  
  console.log('');
});

console.log('=== Summary ===');
let totalItems = 0;
let totalEnriched = 0;
files.forEach(cat => {
  const filePath = path.join(basePath, `${cat}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  totalItems += data.items.length;
  totalEnriched += data.items.filter(i => i.enrichStatus === 'ok').length;
});
console.log(`总条目数: ${totalItems}`);
console.log(`已enriched: ${totalEnriched} (${(totalEnriched/totalItems*100).toFixed(1)}%)`);
console.log(`待enrich: ${totalItems - totalEnriched} (${((totalItems - totalEnriched)/totalItems*100).toFixed(1)}%)`);
