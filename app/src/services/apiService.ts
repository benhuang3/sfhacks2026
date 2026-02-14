/**
 * apiService.ts — Axios HTTP client for FastAPI backend
 *
 * Handles multipart/form-data image upload to POST /scan
 * and generic JSON requests to other endpoints.
 */

import axios, { AxiosError } from 'axios';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Use your local IP (not localhost) when testing on a physical device.
// e.g. "http://192.168.1.42:8000"
const API_BASE_URL = __DEV__
  ? 'http://10.142.12.143:8000'   // ← Your machine's LAN IP
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
export async function uploadScanImage(image: string | File | Blob): Promise<Record<string, unknown>> {
  // Build multipart/form-data
  const formData = new FormData();
<<<<<<< HEAD

  if (typeof window !== 'undefined' && (imageUri.startsWith('blob:') || imageUri.startsWith('data:'))) {
    // ── Web: fetch the blob URL and append as a real File ──
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const file = new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' });
    formData.append('image', file);
  } else {
    // ── React Native: use the {uri, name, type} shape ──
    const filename = imageUri.split('/').pop() ?? 'scan.jpg';
=======
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
>>>>>>> c193cea0e7f4a3027ddd8f71aa6103035c90c88f
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    formData.append('image', {
      uri: image,
      name: filename,
      type: mimeType,
    } as unknown as Blob);
  }

  try {
    // On web, do NOT set Content-Type — the browser must auto-set it
    // with the correct multipart boundary. On React Native, axios needs the hint.
    const headers: Record<string, string> = {};
    if (typeof window === 'undefined') {
      headers['Content-Type'] = 'multipart/form-data';
    }

    const response = await api.post('/scan', formData, { headers });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: string; error?: string }>;
      const detail = axiosErr.response?.data?.detail;
      const serverMessage =
        (typeof detail === 'string' ? detail : JSON.stringify(detail)) ??
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
