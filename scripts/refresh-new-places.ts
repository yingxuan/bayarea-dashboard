import { refreshNewPlacesSnapshot } from '../lib/spend/new-places-job.js';

async function main() {
  process.env.JOB_MODE = process.env.JOB_MODE || '1';
  const snapshot = await refreshNewPlacesSnapshot();
  console.log('[refresh-new-places] Snapshot persisted', {
    generatedAt: snapshot.generatedAt,
    windowDays: snapshot.windowDays,
    places: snapshot.places.length,
  });
}

main().catch((error) => {
  console.error('[refresh-new-places] Failed to refresh snapshot', error);
  process.exit(1);
});
