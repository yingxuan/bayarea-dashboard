/**
 * Seed Place Schema
 * Used for local seed pools that eliminate Places API calls
 * 
 * Supports both direct place links and search URLs:
 * - Place links: https://www.google.com/maps/place/...
 * - Search links: https://www.google.com/maps/search/?api=1&query=...
 */

export type SeedPlace = {
  name: string;
  mapsUrl: string;
  city: string; // e.g. "Cupertino", "Sunnyvale", "San Jose", "Milpitas", "Santa Clara", "Mountain View"
  mapsType?: 'place' | 'search'; // Default: inferred from mapsUrl
  categoryTags?: string[];
  query?: string; // The query string used to generate search link (e.g. "Boba Guys Cupertino CA")
  placeId?: string;
  address?: string;
  rating?: number;
  userRatingCount?: number;
  lat?: number;
  lng?: number;
};

export type SeedCategory = '奶茶' | '中餐' | '夜宵' | '新店打卡';

export type SeedFile = {
  version: number;
  category: SeedCategory;
  region: string;
  updatedAt: string;
  items: SeedPlace[];
};
