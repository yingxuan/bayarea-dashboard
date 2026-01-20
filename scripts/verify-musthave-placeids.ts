import 'dotenv/config';
import { readFileSync } from 'fs';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_PLACES_API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY required');
  process.exit(1);
}

type Entry = { key: string; name: string; city: string; place_id: string };
type MapFile = { [category: string]: Entry[] };

function loadMap(): Entry[] {
  const raw = readFileSync('data/spend/musthave.placeids.json', 'utf-8');
  const parsed = JSON.parse(raw) as MapFile;
  return Object.values(parsed).flat();
}

async function fetchDetails(pid: string) {
  const url = `https://places.googleapis.com/v1/places/${pid}`;
  const fieldMask = 'id,displayName,formattedAddress';
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': fieldMask,
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return { error: `${resp.status} ${txt}` };
  }
  return await resp.json();
}

async function main() {
  const entries = loadMap().filter((e) => !!e.place_id);
  let ok = 0;
  let fail = 0;
  for (const e of entries) {
    const details = await fetchDetails(e.place_id);
    if ((details as any).error) {
      console.log(`${e.key} (${e.name}) -> ERROR ${ (details as any).error }`);
      fail++;
      continue;
    }
    const name = details.displayName?.text || '';
    const address = details.formattedAddress || '';
    const nameOk = name.toLowerCase().includes(e.name.toLowerCase().split(' ')[0]);
    const cityOk = address.toLowerCase().includes(e.city.toLowerCase());
    if (nameOk && cityOk) {
      console.log(`${e.key} OK name="${name}" addr="${address}"`);
      ok++;
    } else {
      console.log(`${e.key} MISMATCH name="${name}" addr="${address}" expected city="${e.city}"`);
      fail++;
    }
  }
  console.log(`done ok=${ok} fail=${fail} total=${ok + fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
