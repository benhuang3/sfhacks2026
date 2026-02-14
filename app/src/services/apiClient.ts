/**
 * API Client — calls the consolidated FastAPI backend (be/)
 *
 * Base URL should point to your dev machine's IP when testing on a
 * physical device, or localhost for emulators.
 */

import { Platform } from 'react-native';

// Web can use localhost; physical devices need LAN IP
const DEV_HOST = Platform.select({
  web: 'localhost',
  android: '10.0.2.2',
  default: '10.142.12.209',  // LAN IP for physical devices
});

const BASE_URL = `http://${DEV_HOST}:8000/api/v1`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PowerProfile {
  category: string;
  standby_watts_range: [number, number];
  standby_watts_typical: number;
  active_watts_range: [number, number];
  active_watts_typical: number;
  confidence: number;
  source: string;
  notes: string[];
}

export interface PowerProfileResponse {
  brand: string;
  model: string;
  name: string;
  region: string;
  profile: PowerProfile;
  cached: boolean;
}

export interface ScanInsertResponse {
  insertedId: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || data.detail?.error || `API error ${res.status}`);
  }

  return data.data as T;
}

/**
 * Fetch power profile for a device from the backend.
 * Calls Gemini AI (with MongoDB cache + category fallback).
 */
export async function fetchPowerProfile(
  brand: string,
  model: string,
  name: string,
  region: string = 'US'
): Promise<PowerProfileResponse> {
  return post<PowerProfileResponse>('/power-profile', {
    brand,
    model,
    name,
    region,
  });
}

/**
 * Save a confirmed scan to the backend database.
 * Embedding is optional — pass a dummy 768-dim vector if not available.
 */
export async function saveScan(params: {
  userId: string;
  imageUrl: string;
  label: string;
  confidence: number;
  deviceSpecs?: {
    avgWatts: number;
    standbyWatts: number;
    source: string;
  };
}): Promise<ScanInsertResponse> {
  // Generate a placeholder embedding (768 zeros) since on-device model
  // embedding extraction is handled separately
  const embedding = new Array(768).fill(0);

  return post<ScanInsertResponse>('/scans', {
    userId: params.userId,
    imageUrl: params.imageUrl,
    imageHash: '',
    embedding,
    label: params.label,
    confidence: params.confidence,
    deviceSpecs: params.deviceSpecs,
  });
}

/**
 * Health check — verify server is reachable.
 */
export async function checkHealth(): Promise<{ status: string; database: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  return data.data;
}
