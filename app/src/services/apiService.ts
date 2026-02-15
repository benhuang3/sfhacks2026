/**
 * apiService.ts — Axios HTTP client for FastAPI backend
 *
 * Handles multipart/form-data image upload to POST /scan
 * and generic JSON requests to other endpoints.
 */

import axios, { AxiosError } from 'axios';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Cloudflare tunnel URL — works from any device (phone, web, emulator)
const TUNNEL_URL = 'https://order-lecture-accounting-rows.trycloudflare.com';

const API_BASE_URL = TUNNEL_URL;

console.log('[apiService] API_BASE_URL =', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120_000, // 2 min — first scan downloads ML models
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
export async function uploadScanImage(image: string | File | Blob): Promise<Record<string, unknown>> {
  // Build multipart/form-data
  const formData = new FormData();
  if (Platform.OS === 'web') {
    // If a File/Blob is passed (from input.files), append directly
    if (image instanceof File || image instanceof Blob) {
      formData.append('image', image, (image as File).name || 'scan.jpg');
    } else if (typeof image === 'string') {
      // image is a blob:// or object URL — fetch to get blob
      try {
        const resp = await fetch(image);
        const blob = await resp.blob();
        formData.append('image', blob, 'scan.jpg');
      } catch (err) {
        throw new Error('Failed to prepare image for upload on web.');
      }
    }
  } else {
    // Native (iOS/Android): use the RN FormData shape
    if (typeof image !== 'string') {
      throw new Error('Native upload expects a file URI string');
    }
    const filename = image.split('/').pop() ?? 'scan.jpg';
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    formData.append('image', {
      uri: image,
      name: filename,
      type: mimeType,
    } as unknown as Blob);
  }

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

export async function checkHealth(): Promise<{ status: string; database: string; models_loaded?: boolean }> {
  const response = await api.get('/api/v1/health');
  return response.data?.data;
}
