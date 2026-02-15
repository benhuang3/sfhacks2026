/**
 * ExecuTorch shim — conditionally imports the real react-native-executorch
 * package when available (dev client build), otherwise falls back to stubs
 * so the app can still run in Expo Go.
 */

// ---------------------------------------------------------------------------
// Stub implementations (used when native module is unavailable)
// ---------------------------------------------------------------------------

function stubUseObjectDetection(_: { model: { modelSource: any } }) {
  return {
    isReady: true,
    isGenerating: false,
    error: null as RnExecutorchError,
    downloadProgress: 1,
    forward: async (_imageUri: string) => {
      return [] as Array<{
        bbox: { x1: number; y1: number; x2: number; y2: number };
        label: string;
        score: number;
      }>;
    },
  };
}

function stubUseOCR(_: { model: any }) {
  return {
    isReady: true,
    forward: async (_imageUri: string) => {
      return [] as Array<{ text: string; confidence: number; bbox: any }>;
    },
  };
}

// ---------------------------------------------------------------------------
// Conditional real import
// ---------------------------------------------------------------------------

let realModule: any = null;
try {
  realModule = require('react-native-executorch');
  console.log('[exec shim] react-native-executorch loaded successfully');
} catch (e) {
  console.warn('[exec shim] react-native-executorch not available, using stubs. Error:', e);
}

export const useObjectDetection =
  realModule?.useObjectDetection ?? stubUseObjectDetection;

export const SSDLITE_320_MOBILENET_V3_LARGE =
  realModule?.SSDLITE_320_MOBILENET_V3_LARGE ?? { modelSource: '' };

export type RnExecutorchError = Error | null;

export const OCR_ENGLISH = realModule?.OCR_ENGLISH ?? 'eng';

export const useOCR = realModule?.useOCR ?? stubUseOCR;
