import 'dotenv/config';

const PLACE_ID = process.env.PLACE_ID;
if (!PLACE_ID) {
  console.error('PLACE_ID env var is required');
  process.exit(1);
}

const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const url = `${BASE_URL}/api/spend/place-photo?place_id=${encodeURIComponent(PLACE_ID)}`;

type ResponseInfo = {
  status: number;
  bodyStatus?: string;
  bodyReason?: string;
  fetchCount?: number;
};

async function hit(): Promise<ResponseInfo> {
  try {
    const resp = await fetch(url);
    const fetchCountHeader = resp.headers.get('x-google-fetch-count') || undefined;
    const fetchCount = fetchCountHeader ? Number(fetchCountHeader) : undefined;
    const json: any = await resp.json().catch(() => ({}));
    return {
      status: resp.status,
      bodyStatus: json.status,
      bodyReason: json.reason,
      fetchCount: Number.isFinite(fetchCount) ? fetchCount : undefined,
    };
  } catch (err: any) {
    return { status: 0, bodyStatus: 'error', bodyReason: err?.message };
  }
}

async function main() {
  console.log(`place_id: ${PLACE_ID}`);
  console.log(`requests: ${CONCURRENCY}`);
  const promises: Promise<ResponseInfo>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(hit());
  }
  const results = await Promise.all(promises);

  const statusCounts = results.reduce<Record<string, number>>((acc, r) => {
    const key = r.bodyStatus || `http_${r.status}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const maxFetchCount = results.reduce((max, r) => {
    if (typeof r.fetchCount === 'number' && r.fetchCount > max) return r.fetchCount;
    return max;
  }, 0);

  console.log('status:');
  Object.entries(statusCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`X-Google-Fetch-Count (max): ${maxFetchCount}`);

  if (maxFetchCount === 1) {
    console.log('RESULT: PASS');
    process.exit(0);
  } else {
    console.log('RESULT: FAIL');
    process.exit(1);
  }
}

main();
