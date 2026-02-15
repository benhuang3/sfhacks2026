import {
  useObjectDetection,
  SSDLITE_320_MOBILENET_V3_LARGE,
  RnExecutorchError,
} from '../shims/exec';
import { useCallback, useMemo } from 'react';
import { Detection, BBox } from '../utils/scannerTypes';
import { isApplianceClass } from '../utils/applianceClasses';
import { log } from '../utils/logger';

interface ScannerPipelineResult {
  detect: (imageUri: string) => Promise<Detection[]>;
  isReady: boolean;
  isGenerating: boolean;
  error: RnExecutorchError | null;
  downloadProgress: number;
}

export function useScannerPipeline(): ScannerPipelineResult {
  // SSDLITE_320_MOBILENET_V3_LARGE is already { modelSource: url }
  const detector = useObjectDetection({
    model: SSDLITE_320_MOBILENET_V3_LARGE,
  });

  const detect = useCallback(
    async (imageUri: string): Promise<Detection[]> => {
      if (!detector.isReady) return [];

      try {
        // Use a lower threshold (0.3) to catch more objects — default 0.7 is too strict
        const results = await detector.forward(imageUri, 0.3);

        log.scan(`forward() returned ${results.length} raw detections`, {
          labels: results.map((r: any) => `${r.label}:${r.score?.toFixed(2)}`),
        });

        // Executorch returns UPPERCASE_SNAKE labels (e.g. "MICROWAVE",
        // "CELL_PHONE", "HAIR_DRIER"). Normalize to lowercase + spaces to
        // match our applianceClasses mapping.
        const normalize = (lbl: string) =>
          lbl.toLowerCase().replace(/_/g, ' ');

        const filtered = results
          .filter((r: any) => isApplianceClass(normalize(r.label)))
          .map((r: any) => ({
            bbox: {
              x1: r.bbox.x1,
              y1: r.bbox.y1,
              x2: r.bbox.x2,
              y2: r.bbox.y2,
            } as BBox,
            label: normalize(r.label),
            score: r.score,
          }));

        if (results.length > 0 && filtered.length === 0) {
          log.scan('All detections filtered out by isApplianceClass', {
            rejected: results.map((r: any) => normalize(r.label)),
          });
        }

        return filtered;
      } catch (e) {
        log.error('scan', 'Detection forward() failed', e);
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
