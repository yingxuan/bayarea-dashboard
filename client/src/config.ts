/**
 * Application Configuration
 * 
 * IMPORTANT: Frontend is hosted on manus.space, backend on vercel.app
 * 
 * API Base URL Configuration:
 * 1. Set VITE_API_BASE_URL in Manus project settings (recommended)
 * 2. Or update the fallback URL below after Vercel deployment
 * 
 * Example:
 * VITE_API_BASE_URL=https://bayarea-dashboard.vercel.app
 */

// API Base URL - prioritize environment variable, fallback based on environment
const getApiBaseUrl = () => {
  // If explicitly set, use it
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // In development, use relative path (Vite proxy will forward to localhost:3001)
  if (import.meta.env.DEV) {
    return ''; // Empty string = relative path, uses Vite proxy
  }
  
  // In production, use Vercel URL
  return 'https://bayarea-dashboard.vercel.app';
};

export const API_BASE_URL = getApiBaseUrl();

export const config = {
  apiBaseUrl: API_BASE_URL,
};

// Re-export places config
export { NEW_PLACES_TTL_DAYS, NEW_PLACES_COOLDOWN_DAYS, NEW_PLACES_MAX_API_CALLS_PER_REFRESH } from './config/places';

// Log API base URL for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('[Config] API Base URL:', API_BASE_URL);
}
