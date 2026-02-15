/**
 * Centralized API config — single source of truth for the backend URL.
 *
 * Set EXPO_PUBLIC_API_URL in app/.env to your Cloudflare tunnel URL.
 * All service files import from here instead of hardcoding the URL.
 */

/** Backend base URL (Cloudflare tunnel or localhost). No trailing slash. */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

/** Backend API v1 base URL. */
export const API_V1_URL = `${API_BASE_URL}/api/v1`;

console.log('[apiConfig] API_BASE_URL =', API_BASE_URL);
