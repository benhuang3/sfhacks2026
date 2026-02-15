import { BBox } from './scannerTypes';

/** Compute Intersection over Union between two bounding boxes */
export function computeIoU(a: BBox, b: BBox): number {
  const xA = Math.max(a.x1, b.x1);
  const yA = Math.max(a.y1, b.y1);
  const xB = Math.min(a.x2, b.x2);
  const yB = Math.min(a.y2, b.y2);

  const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (intersection === 0) return 0;

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/** Scale a bounding box from model coordinate space to screen coordinate space */
export function scaleBBox(
  bbox: BBox,
  imgWidth: number,
  imgHeight: number,
  viewWidth: number,
  viewHeight: number
): { left: number; top: number; width: number; height: number } {
  const scaleX = viewWidth / imgWidth;
  const scaleY = viewHeight / imgHeight;

  return {
    left: bbox.x1 * scaleX,
    top: bbox.y1 * scaleY,
    width: (bbox.x2 - bbox.x1) * scaleX,
    height: (bbox.y2 - bbox.y1) * scaleY,
  };
}

/** Expand a bounding box by a padding ratio (e.g., 0.1 = 10% on each side) */
export function padBBox(
  bbox: BBox,
  padding: number,
  maxWidth: number,
  maxHeight: number
): BBox {
  const w = bbox.x2 - bbox.x1;
  const h = bbox.y2 - bbox.y1;
  const padX = w * padding;
  const padY = h * padding;

  return {
    x1: Math.max(0, bbox.x1 - padX),
    y1: Math.max(0, bbox.y1 - padY),
    x2: Math.min(maxWidth, bbox.x2 + padX),
    y2: Math.min(maxHeight, bbox.y2 + padY),
  };
}

/** Get the center point of a bounding box */
export function bboxCenter(bbox: BBox): { x: number; y: number } {
  return {
    x: (bbox.x1 + bbox.x2) / 2,
    y: (bbox.y1 + bbox.y2) / 2,
  };
}

/** Get the area of a bounding box */
export function bboxArea(bbox: BBox): number {
  return (bbox.x2 - bbox.x1) * (bbox.y2 - bbox.y1);
}

/**
 * Compute how much of box B's area is contained inside box A.
 * Returns 0..1 — 1.0 means B is fully inside A.
 */
function containment(a: BBox, b: BBox): number {
  const xA = Math.max(a.x1, b.x1);
  const yA = Math.max(a.y1, b.y1);
  const xB = Math.min(a.x2, b.x2);
  const yB = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return areaB > 0 ? intersection / areaB : 0;
}

/**
 * Non-Maximum Suppression — removes overlapping detections of the same object.
 * Suppresses a lower-confidence box if either:
 *   - IoU with a kept box >= iouThreshold, OR
 *   - it is mostly contained inside a kept box (>= containmentThreshold of its area)
 * This catches cases like laptop+TV on the same object where one bbox is inside the other
 * but IoU is low due to different sizes.
 */
export function nms<T extends { bbox: BBox; score: number }>(
  items: T[],
  iouThreshold: number = 0.55,
  containmentThreshold: number = 0.85
): T[] {
  if (items.length <= 1) return items;

  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]);

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      const iou = computeIoU(sorted[i].bbox, sorted[j].bbox);
      const cont = containment(sorted[i].bbox, sorted[j].bbox);
      if (iou >= iouThreshold || cont >= containmentThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}
