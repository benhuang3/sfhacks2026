export const SSDLITE_320_MOBILENET_V3_LARGE = 'ssdlite_320_mobilenet_v3_large';
export type RnExecutorchError = Error | null;

export function useObjectDetection(_: { model: { modelSource: string } }) {
  // Simple stub: pretend detector is ready with no models downloaded and returns no detections.
  const detector = {
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

  return detector;
}

export const OCR_ENGLISH = 'eng';
export function useOCR(_: { model: string }) {
  return {
    isReady: true,
    forward: async (_imageUri: string) => {
      return [] as Array<{ text: string; confidence: number; bbox: any }>;
    },
  };
}
