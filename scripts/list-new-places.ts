import { searchTextPlaces } from '../lib/spend/placesClient.js';

async function main() {
  const response = await searchTextPlaces(
    'restaurant OR cafe',
    { lat: 37.3230, lng: -122.0322 },
    15000,
    20
  );
  const places = response.places || [];
  console.log(`Fetched ${places.length} places:`);
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    console.log(`${i + 1}. ${place.displayName?.text || place.id}`);
    console.log(`   rating=${place.rating ?? 'n/a'} reviews=${place.userRatingCount ?? 'n/a'}`);
    console.log(`   address=${place.formattedAddress ?? 'unknown'}`);
    if (place.googleMapsUri) {
      console.log(`   maps_url=${place.googleMapsUri}`);
    }
  }
}

main().catch((error) => {
  console.error('[list-new-places] Failed', error);
  process.exit(1);
});
