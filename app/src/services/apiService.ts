/**
 * apiService.ts — Axios HTTP client for FastAPI backend
 *
 * Handles multipart/form-data image upload to POST /scan
 * and generic JSON requests to other endpoints.
 */

import axios, { AxiosError } from 'axios';
import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Use your local IP (not localhost) when testing on a physical device.
// e.g. "http://192.168.1.42:8000"
const API_BASE_URL = __DEV__
  ? 'http://10.142.12.209:8000'   // ← Your machine's LAN IP
  : 'https://your-production-url.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

// ---------------------------------------------------------------------------
// Upload scanned image → POST /scan
// ---------------------------------------------------------------------------

/**
 * Upload a captured photo to the FastAPI /scan endpoint.
 *
 * @param imageUri  Local file URI from expo-camera (e.g. file:///…/photo.jpg)
 * @returns         Parsed JSON response from the backend
 */
export async function uploadScanImage(imageUri: string): Promise<Record<string, unknown>> {
  // Build multipart/form-data
  const formData = new FormData();

  // Extract filename from URI
  const filename = imageUri.split('/').pop() ?? 'scan.jpg';

  // Determine MIME type from extension
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // Append file — React Native FormData accepts this shape
  formData.append('image', {
    uri: imageUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  try {
    const response = await api.post('/scan', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: string; error?: string }>;
      const serverMessage =
        axiosErr.response?.data?.detail ??
        axiosErr.response?.data?.error ??
        axiosErr.message;
      throw new Error(`Scan failed (${axiosErr.response?.status ?? 'network'}): ${serverMessage}`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Power profile lookup → POST /api/v1/power-profile
// ---------------------------------------------------------------------------

interface PowerProfileRequest {
  brand: string;
  model: string;
  name: string;
  region?: string;
}

export async function fetchPowerProfile(device: PowerProfileRequest) {
  try {
    const response = await api.post('/api/v1/power-profile', {
      brand: device.brand,
      model: device.model,
      name: device.name,
      region: device.region ?? 'US',
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: string }>;
      throw new Error(
        `Power profile lookup failed: ${axiosErr.response?.data?.detail ?? axiosErr.message}`
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Health check → GET /api/v1/health
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<{ status: string; database: string }> {
  const response = await api.get('/api/v1/health');
  return response.data?.data;
}
