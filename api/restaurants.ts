/**
 * Vercel Serverless Function: /api/restaurants
 * Fetches real Chinese restaurants near Cupertino using Yelp Fusion API
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const YELP_API_KEY = process.env.YELP_API_KEY!;
const YELP_API_URL = 'https://api.yelp.com/v3/businesses/search';

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

interface Restaurant {
  id: string;
  name: string;
  rating: number;
  review_count: number;
  price_level: string;
  cuisine: string;
  address: string;
  distance_miles: number;
  photo_url: string;
  url: string; // Yelp business URL
}

async function fetchYelpRestaurants(): Promise<Restaurant[]> {
  if (!YELP_API_KEY) {
    throw new Error('YELP_API_KEY environment variable is not set');
  }

  // Search for Chinese restaurants near Cupertino (Monta Vista HS area)
  const params = new URLSearchParams({
    term: 'Chinese restaurant',
    latitude: '37.3230',  // Cupertino / Monta Vista HS
    longitude: '-122.0322',
    radius: '8000', // 5 miles in meters
    categories: 'chinese,dimsum,szechuan,cantonese,taiwanese',
    sort_by: 'rating',
    limit: '20',
  });

  const response = await fetch(`${YELP_API_URL}?${params}`, {
    headers: {
      'Authorization': `Bearer ${YELP_API_KEY}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Yelp API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  return (data.businesses || []).map((business: any) => ({
    id: business.id,
    name: business.name,
    rating: business.rating,
    review_count: business.review_count,
    price_level: business.price || '$$',
    cuisine: business.categories?.[0]?.title || 'Chinese',
    address: business.location?.display_address?.join(', ') || '',
    distance_miles: parseFloat((business.distance / 1609.34).toFixed(1)), // meters to miles
    photo_url: business.image_url || '',
    url: business.url, // Yelp business page URL
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Check cache
    const cacheKey = 'restaurants';
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        ...cached.data,
        cache_hit: true,
      });
    }

    // Fetch fresh data
    const restaurants = await fetchYelpRestaurants();
    
    const response = {
      restaurants: restaurants.slice(0, 6), // Top 6 restaurants
      updated_at: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      cache_hit: false,
    };

    // Update cache
    cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('[API /api/restaurants] Error:', error);
    
    // Try to return stale cache
    const cacheKey = 'restaurants';
    const stale = cache.get(cacheKey);
    
    if (stale) {
      return res.status(200).json({
        ...stale.data,
        cache_hit: true,
        stale: true,
      });
    }

    res.status(500).json({
      error: 'Failed to fetch restaurants',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
