/**
 * Auth API — calls the FastAPI auth endpoints
 */

// Cloudflare tunnel URL — works from any network
const TUNNEL_URL = 'https://chips-copied-badly-applied.trycloudflare.com';

const BASE_URL = `${TUNNEL_URL}/api/v1`;

console.log('[authApi] BASE_URL =', BASE_URL);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  homeId?: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

function parseJsonSafe(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function authPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    console.log('[authApi] Fetching:', `${BASE_URL}${path}`);
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    console.log('[authApi] Response status:', res.status);
  } catch (networkErr) {
    console.log('[authApi] Network error:', networkErr);
    throw new Error('Cannot reach server. Make sure the backend is running and the tunnel is active.');
  }

  const text = await res.text();
  const data = parseJsonSafe(text);

  if (data === null) {
    // Server returned non-JSON (HTML error page, Cloudflare gateway, etc.)
    throw new Error('Server returned an invalid response. The tunnel may be down — please restart it.');
  }

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Auth error ${res.status}`);
  }

  return (data.data ?? data) as T;
}

async function authGet<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  } catch (networkErr) {
    throw new Error('Cannot reach server. Make sure the backend is running and the tunnel is active.');
  }

  const text = await res.text();
  const data = parseJsonSafe(text);

  if (data === null) {
    throw new Error('Server returned an invalid response. The tunnel may be down — please restart it.');
  }

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `Auth error ${res.status}`);
  }

  return (data.data ?? data) as T;
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function apiSignup(email: string, password: string, name?: string): Promise<AuthResponse> {
  return authPost<AuthResponse>('/auth/signup', { email, password, name: name || '' });
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return authPost<AuthResponse>('/auth/login', { email, password });
}

export async function apiForgotPassword(email: string): Promise<{ message: string; _debug_otp?: string }> {
  return authPost('/auth/forgot-password', { email });
}

export async function apiResetPassword(email: string, code: string, newPassword: string): Promise<{ message: string }> {
  return authPost('/auth/reset-password', { email, code, new_password: newPassword });
}

export async function apiGetMe(token: string): Promise<AuthUser> {
  return authGet<AuthUser>('/auth/me', token);
}
