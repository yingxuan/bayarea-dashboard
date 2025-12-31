/**
 * Application Configuration
 */

// API Base URL - update this after Vercel deployment
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.MODE === 'production' 
    ? 'https://bayarea-dashboard.vercel.app'
    : 'http://localhost:3000');

export const config = {
  apiBaseUrl: API_BASE_URL,
};
