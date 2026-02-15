/**
 * useSegmentationOverlay — manages DeepLabV3 segmentation model and caches
 * outline SVG paths per tracked object for rendering.
 *
 * Runs segmentation throttled (every ~2-3s) and only for classes that DeepLabV3
 * can segment. Non-segmentable objects fall back to bounding boxes.
 */

import { useRef, useCallback, useState } from 'react';
import {
  useImageSegmentation,
  DEEPLAB_V3_RESNET50,
} from '../shims/exec';
import { TrackedObject } from '../utils/scannerTypes';
import { maskToSvgPath, scaleSvgPath } from '../utils/contourExtractor';
import {
  isSegmentable,
  getDeeplabLabel,
  getSegmentableDeeplabLabels,
} from '../utils/segmentationClasses';
import { log } from '../utils/logger';

export interface SegmentationOverlay {
  trackId: string;
  svgPath: string;
  label: string;
  color: string;
}

export interface UseSegmentationOverlayResult {
  isReady: boolean;
  downloadProgress: number;
  error: any;
  overlays: SegmentationOverlay[];
  requestSegmentation: (
    imageUri: string,
    trackedObjects: TrackedObject[],
    imgWidth: number,
    imgHeight: number,
    viewWidth: number,
    viewHeight: number
  ) => void;
}

export function useSegmentationOverlay(): UseSegmentationOverlayResult {
  const segmentation = useImageSegmentation({
    model: DEEPLAB_V3_RESNET50,
  });

  const [overlays, setOverlays] = useState<SegmentationOverlay[]>([]);
  const isProcessingRef = useRef(false);
  const lastRunRef = useRef(0);
  const cacheRef = useRef<Map<string, SegmentationOverlay>>(new Map());

  const requestSegmentation = useCallback(
    (
      imageUri: string,
      trackedObjects: TrackedObject[],
      imgWidth: number,
      imgHeight: number,
      viewWidth: number,
      viewHeight: number
    ) => {
      // Throttle: at most once every 2 seconds
      const now = Date.now();
      if (now - lastRunRef.current < 2000) return;
      if (isProcessingRef.current || !segmentation.isReady) return;

      // Only segment objects that DeepLabV3 supports
      const segmentable = trackedObjects.filter(
        (obj) => obj.framesSinceLastSeen === 0 && isSegmentable(obj.label)
      );
      if (segmentable.length === 0) return;

      isProcessingRef.current = true;
      lastRunRef.current = now;

      const classesOfInterest = getSegmentableDeeplabLabels();

      // Fire-and-forget — don't block the detection loop
      (async () => {
        try {
          const result = await segmentation.forward(
            imageUri,
            classesOfInterest,
            true // resize mask to match image dimensions
          );

          const scaleX = viewWidth / imgWidth;
          const scaleY = viewHeight / imgHeight;
          const newOverlays: SegmentationOverlay[] = [];

          for (const obj of segmentable) {
            const deeplabIdx = getDeeplabLabel(obj.label);
            if (deeplabIdx === null) continue;

            const mask = result[deeplabIdx];
            if (!mask || mask.length === 0) continue;

            const rawPath = maskToSvgPath(mask, imgWidth, imgHeight);
            if (!rawPath) continue;

            const scaledPath = scaleSvgPath(rawPath, scaleX, scaleY);

            const overlay: SegmentationOverlay = {
              trackId: obj.id,
              svgPath: scaledPath,
              label: obj.label,
              color: '#4CAF50',
            };

            newOverlays.push(overlay);
            cacheRef.current.set(obj.id, overlay);
          }

          // Merge new overlays with cached ones for objects still being tracked
          const activeIds = new Set(trackedObjects.map((o) => o.id));
          const merged: SegmentationOverlay[] = [];

          // Add fresh overlays from this run
          for (const o of newOverlays) {
            merged.push(o);
          }

          // Add cached overlays for tracked objects not in this run
          for (const [id, cached] of cacheRef.current) {
            if (!activeIds.has(id)) {
              cacheRef.current.delete(id);
              continue;
            }
            if (!newOverlays.find((o) => o.trackId === id)) {
              merged.push(cached);
            }
          }

          setOverlays(merged);
          log.scan(`Segmentation: ${newOverlays.length} outlines generated`);
        } catch (err) {
          log.error('scan', 'Segmentation failed', err);
        } finally {
          isProcessingRef.current = false;
        }
      })();
    },
    [segmentation.isReady, segmentation.forward]
  );

  return {
    isReady: segmentation.isReady,
    downloadProgress: segmentation.downloadProgress,
    error: segmentation.error,
    overlays,
    requestSegmentation,
  };
}
