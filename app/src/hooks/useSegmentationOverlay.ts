/**
 * useSegmentationOverlay — manages DeepLabV3 segmentation model and produces
 * per-object outlines using the contourExtractor pipeline.
 *
 * Features:
 * - Throttled segmentation (every ~2s)
 * - Per-detection instance masks (intersect class mask with bbox via extractOutlines)
 * - Temporal smoothing: reuses last contour between seg updates
 * - Cover-aware coordinate mapping
 */

import { useRef, useCallback, useState } from 'react';
import {
  useImageSegmentation,
  DEEPLAB_V3_RESNET50,
} from '../shims/exec';
import { TrackedObject, BBox } from '../utils/scannerTypes';
import { extractOutlines, OutlineResult } from '../utils/contourExtractor';
import {
  isSegmentable,
  getDeeplabLabel,
  getSegmentableDeeplabLabels,
} from '../utils/segmentationClasses';
import { log } from '../utils/logger';

// ── Public types ────────────────────────────────────────────────────────

export interface SegmentationOverlay {
  trackId: string;
  svgPath: string;
  label: string;
  color: string;
  outline?: OutlineResult;
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

// ── Temporal smoothing ──────────────────────────────────────────────────

interface CachedOutline {
  overlay: SegmentationOverlay;
  lastBBox: BBox;
  timestamp: number;
}

const OUTLINE_MAX_AGE_MS = 6000;

// ── Hook ────────────────────────────────────────────────────────────────

export function useSegmentationOverlay(): UseSegmentationOverlayResult {
  const segmentation = useImageSegmentation({
    model: DEEPLAB_V3_RESNET50,
  });

  const [overlays, setOverlays] = useState<SegmentationOverlay[]>([]);
  const isProcessingRef = useRef(false);
  const lastRunRef = useRef(0);
  const cacheRef = useRef<Map<string, CachedOutline>>(new Map());

  const requestSegmentation = useCallback(
    (
      imageUri: string,
      trackedObjects: TrackedObject[],
      imgWidth: number,
      imgHeight: number,
      viewWidth: number,
      viewHeight: number
    ) => {
      const now = Date.now();

      // Between seg updates, serve from cache
      if (now - lastRunRef.current < 2000) {
        serveCached(trackedObjects, now);
        return;
      }
      if (isProcessingRef.current || !segmentation.isReady) return;

      const segmentable = trackedObjects.filter(
        (obj) => obj.framesSinceLastSeen === 0 && isSegmentable(obj.label)
      );
      if (segmentable.length === 0) {
        serveCached(trackedObjects, now);
        return;
      }

      isProcessingRef.current = true;
      lastRunRef.current = now;

      const classesOfInterest = getSegmentableDeeplabLabels();

      (async () => {
        try {
          const result = await segmentation.forward(
            imageUri,
            classesOfInterest,
            true
          );

          const newOverlays: SegmentationOverlay[] = [];

          // Group segmentable objects by class to batch mask access
          const byClass = new Map<number, typeof segmentable>();
          for (const obj of segmentable) {
            const idx = getDeeplabLabel(obj.label);
            if (idx === null) continue;
            if (!byClass.has(idx)) byClass.set(idx, []);
            byClass.get(idx)!.push(obj);
          }

          for (const [deeplabIdx, objects] of byClass) {
            const mask = result[deeplabIdx];
            if (!mask || mask.length === 0) continue;

            // Extract per-object outlines (bbox intersection + contour tracing)
            const outlines = extractOutlines({
              mask,
              imgWidth,
              imgHeight,
              viewWidth,
              viewHeight,
              detections: objects.map((o) => ({
                id: o.id,
                label: o.label,
                score: o.score,
                bbox: o.bbox,
              })),
            });

            for (const outline of outlines) {
              const overlay: SegmentationOverlay = {
                trackId: outline.id,
                svgPath: outline.pathSvg,
                label: outline.className,
                color: '#4CAF50',
                outline,
              };
              newOverlays.push(overlay);

              const obj = objects.find((o) => o.id === outline.id);
              cacheRef.current.set(outline.id, {
                overlay,
                lastBBox: obj?.bbox ?? outline.box,
                timestamp: now,
              });
            }
          }

          // Merge with cache for tracked objects not in this batch
          const freshIds = new Set(newOverlays.map((o) => o.trackId));
          const activeIds = new Set(trackedObjects.map((o) => o.id));
          const merged = [...newOverlays];

          for (const [id, cached] of cacheRef.current) {
            if (!activeIds.has(id)) {
              cacheRef.current.delete(id);
              continue;
            }
            if (now - cached.timestamp > OUTLINE_MAX_AGE_MS) {
              cacheRef.current.delete(id);
              continue;
            }
            if (!freshIds.has(id)) {
              merged.push(cached.overlay);
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

  /**
   * Serve cached overlays for tracked objects between segmentation runs.
   */
  function serveCached(trackedObjects: TrackedObject[], now: number) {
    const activeIds = new Set(trackedObjects.map((o) => o.id));
    const cached: SegmentationOverlay[] = [];

    for (const [id, entry] of cacheRef.current) {
      if (!activeIds.has(id)) {
        cacheRef.current.delete(id);
        continue;
      }
      if (now - entry.timestamp > OUTLINE_MAX_AGE_MS) {
        cacheRef.current.delete(id);
        continue;
      }
      cached.push(entry.overlay);
    }

    setOverlays(cached);
  }

  return {
    isReady: segmentation.isReady,
    downloadProgress: segmentation.downloadProgress,
    error: segmentation.error,
    overlays,
    requestSegmentation,
  };
}
