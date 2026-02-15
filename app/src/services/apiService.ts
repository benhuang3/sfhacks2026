/**
 * apiService.ts — Axios HTTP client for FastAPI backend
 *
 * Handles multipart/form-data image upload to POST /scan
 * and generic JSON requests to other endpoints.
 */

import axios, { AxiosError } from 'axios';
import { Platform } from 'react-native';
import { log } from '../utils/logger';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { API_BASE_URL } from '../utils/apiConfig';

log.config('apiService API_BASE_URL', { url: API_BASE_URL });

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
    log.api('POST /scan (multipart image upload)');
    const response = await api.post('/scan', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    log.api('POST /scan -> success', response.data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: string; error?: string }>;
      const serverMessage =
        axiosErr.response?.data?.detail ??
        axiosErr.response?.data?.error ??
        axiosErr.message;
      log.error('api', `POST /scan failed (${axiosErr.response?.status ?? 'network'})`, axiosErr);
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
  log.api('POST /api/v1/power-profile', { brand: device.brand, model: device.model, name: device.name });
  try {
    const response = await api.post('/api/v1/power-profile', {
      brand: device.brand,
      model: device.model,
      name: device.name,
      region: device.region ?? 'US',
    });
    log.api('POST /api/v1/power-profile -> success');
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: string }>;
      log.error('api', `Power profile lookup failed (${axiosErr.response?.status ?? 'network'})`, axiosErr);
      throw new Error(
        `Power profile lookup failed: ${axiosErr.response?.data?.detail ?? axiosErr.message}`
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Multi-angle brand identification → POST /api/v1/identify-brand
// ---------------------------------------------------------------------------

export interface BrandIdentification {
  brand: string;
  model: string;
}

/**
 * Send multiple angle images + category to Gemini for brand/model identification.
 *
 * @param imageUris  Array of local file URIs (cropped angle photos)
 * @param category   Basic category from on-device detection (e.g. "Television")
 * @returns          Brand and model identification
 */
export async function identifyBrand(
  imageUris: string[],
  category: string
): Promise<BrandIdentification> {
  log.api('POST /api/v1/identify-brand', { category, imageCount: imageUris.length });
  try {
    // Convert image URIs to base64
    const base64Images: string[] = [];
    for (const uri of imageUris) {
      if (Platform.OS === 'web') {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const b64 = await blobToBase64(blob);
        base64Images.push(b64);
      } else {
        const FileSystem = await import('expo-file-system/legacy');
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        base64Images.push(b64);
      }
    }

    const response = await api.post('/api/v1/identify-brand', {
      category,
      image_uris: base64Images,
    });

    log.api('POST /api/v1/identify-brand -> success', response.data?.data);
    const data = response.data?.data;
    return {
      brand: data?.brand ?? 'Unknown',
      model: data?.model ?? 'Unknown',
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ detail?: string }>;
      log.error('api', `Brand identification failed (${axiosErr.response?.status ?? 'network'})`, axiosErr);
    } else {
      log.error('api', 'Brand identification failed', error);
    }
    return { brand: 'Unknown', model: 'Unknown' };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const b64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Health check → GET /api/v1/health
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<{ status: string; database: string; models_loaded?: boolean }> {
  log.api('GET /api/v1/health');
  const response = await api.get('/api/v1/health');
  log.api('GET /api/v1/health -> success', response.data?.data);
  return response.data?.data;
}
