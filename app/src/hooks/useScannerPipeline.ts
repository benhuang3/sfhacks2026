import {
  useObjectDetection,
  SSDLITE_320_MOBILENET_V3_LARGE,
  RnExecutorchError,
} from 'react-native-executorch';
import { useCallback, useMemo } from 'react';
import { Detection, BBox } from '../utils/scannerTypes';
import { isApplianceClass } from '../utils/applianceClasses';

interface ScannerPipelineResult {
  detect: (imageUri: string) => Promise<Detection[]>;
  isReady: boolean;
  isGenerating: boolean;
  error: RnExecutorchError | null;
  downloadProgress: number;
}

export function useScannerPipeline(): ScannerPipelineResult {
  const detector = useObjectDetection({
    model: { modelSource: SSDLITE_320_MOBILENET_V3_LARGE },
  });

  const detect = useCallback(
    async (imageUri: string): Promise<Detection[]> => {
      if (!detector.isReady) return [];

      try {
        const results = await detector.forward(imageUri);

        // Map react-native-executorch detections to our Detection type
        // and filter to appliance classes only
        return results
          .filter((r) => isApplianceClass(r.label))
          .map((r) => ({
            bbox: {
              x1: r.bbox.x1,
              y1: r.bbox.y1,
              x2: r.bbox.x2,
              y2: r.bbox.y2,
            } as BBox,
            label: r.label,
            score: r.score,
          }));
      } catch (e) {
        console.warn('Detection failed:', e);
        return [];
      }
    },
    [detector.isReady]
  );

  const result = useMemo(
    () => ({
      detect,
      isReady: detector.isReady,
      isGenerating: detector.isGenerating,
      error: detector.error,
      downloadProgress: detector.downloadProgress,
    }),
    [detect, detector.isReady, detector.isGenerating, detector.error, detector.downloadProgress]
  );

  return result;
}
