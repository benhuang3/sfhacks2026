/**
 * Auth API — calls the FastAPI auth endpoints
 */

import { Platform } from 'react-native';

const DEV_HOST = Platform.select({
  web: 'localhost',
  android: '10.0.2.2',
  default: '10.142.12.209',
});

const BASE_URL = `http://${DEV_HOST}:8000/api/v1`;

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

async function authPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || data.error || `Auth error ${res.status}`);
  }

  return (data.data ?? data) as T;
}

async function authGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || data.error || `Auth error ${res.status}`);
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
