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

// API Base URL - prioritize environment variable, fallback to hardcoded URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://bayarea-dashboard.vercel.app';

export const config = {
  apiBaseUrl: API_BASE_URL,
};

// Log API base URL for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('[Config] API Base URL:', API_BASE_URL);
}
