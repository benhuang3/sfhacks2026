/**
 * contourExtractor.ts — Main pipeline for extracting per-object outlines
 * from DeepLabV3 semantic segmentation masks.
 *
 * Pipeline:
 *   1. Downsample the global class mask
 *   2. Intersect with each detection bbox to get per-instance ROI masks
 *   3. Apply morphological closing + opening to clean up
 *   4. Trace contour via Moore-neighbor algorithm
 *   5. Simplify with RDP
 *   6. Map from mask space → image space → view space (cover-aware)
 *   7. Build smooth SVG bezier path
 */

import { Point, traceContour, rdpSimplify, smoothContour } from './geometry/contours';
import { cleanMask } from './geometry/morphology';
import {
  computeImageToViewTransform,
  mapContourToView,
  viewContourToSvgPath,
  ImageToViewTransform,
} from './geometry/transforms';
import { BBox } from './scannerTypes';

// ── Public types ────────────────────────────────────────────────────────

export interface OutlineResult {
  /** Stable track ID from the object tracker */
  id: string;
  /** COCO class name (e.g., "tv") */
  className: string;
  /** Detection confidence */
  confidence: number;
  /** Contour points in view (screen) space */
  contour: Point[];
  /** SVG path string in view space */
  pathSvg: string;
  /** Source image dimensions */
  sourceImageSize: { w: number; h: number };
  /** Detection box in image space */
  box: BBox;
}

export interface ExtractOutlinesInput {
  /** Global class mask from DeepLabV3 (flat probability array) */
  mask: number[];
  /** Image width (mask dimensions if resize=true) */
  imgWidth: number;
  /** Image height */
  imgHeight: number;
  /** View width (camera layout) */
  viewWidth: number;
  /** View height */
  viewHeight: number;
  /** Detections to extract outlines for */
  detections: {
    id: string;
    label: string;
    score: number;
    bbox: BBox;
  }[];
  /** Probability threshold (default 0.4) */
  threshold?: number;
  /** Downsample factor (default 2) */
  downsample?: number;
}

// ── Configuration ───────────────────────────────────────────────────────

const MORPHOLOGY_RADIUS = 2;
const RDP_EPSILON = 5; // in image-space pixels (not multiplied by downsample)
const MAX_CONTOUR_POINTS = 150;
const MAX_DETECTIONS = 5;
const MIN_CONTOUR_AREA_RATIO = 0.02; // contour must cover >2% of bbox
const CHAIKIN_ITERATIONS = 2; // smoothing passes before SVG generation

// ── Main pipeline ───────────────────────────────────────────────────────

/**
 * Extract per-object outlines from a semantic segmentation mask.
 *
 * For each detection bbox of a supported class:
 *   - Crops the global mask to the bbox region
 *   - Cleans with morphology (close → open)
 *   - Traces contour via Moore-neighbor
 *   - Simplifies with RDP
 *   - Maps to view coordinates with cover-aware transform
 */
export function extractOutlines(input: ExtractOutlinesInput): OutlineResult[] {
  const {
    mask,
    imgWidth,
    imgHeight,
    viewWidth,
    viewHeight,
    detections,
    threshold = 0.5,
    downsample = 1,
  } = input;

  const results: OutlineResult[] = [];

  // Limit to top N detections by score
  const sortedDets = [...detections]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DETECTIONS);

  // Compute image→view transform (cover mode for camera preview)
  const transform = computeImageToViewTransform(
    imgWidth,
    imgHeight,
    viewWidth,
    viewHeight,
    'cover'
  );

  const epsilon = RDP_EPSILON;

  for (const det of sortedDets) {
    const outline = extractSingleOutline(
      mask,
      imgWidth,
      imgHeight,
      det,
      threshold,
      downsample,
      epsilon,
      transform
    );
    if (outline) {
      results.push(outline);
    }
  }

  return results;
}

/**
 * Extract outline for a single detection.
 */
function extractSingleOutline(
  globalMask: number[],
  imgW: number,
  imgH: number,
  det: { id: string; label: string; score: number; bbox: BBox },
  threshold: number,
  downsample: number,
  epsilon: number,
  transform: ImageToViewTransform
): OutlineResult | null {
  // 1. Compute ROI in image space (clamp to image bounds, add 5% padding)
  const padX = (det.bbox.x2 - det.bbox.x1) * 0.05;
  const padY = (det.bbox.y2 - det.bbox.y1) * 0.05;
  const roiX1 = Math.max(0, Math.floor(det.bbox.x1 - padX));
  const roiY1 = Math.max(0, Math.floor(det.bbox.y1 - padY));
  const roiX2 = Math.min(imgW, Math.ceil(det.bbox.x2 + padX));
  const roiY2 = Math.min(imgH, Math.ceil(det.bbox.y2 + padY));
  const roiW = roiX2 - roiX1;
  const roiH = roiY2 - roiY1;

  if (roiW < 4 || roiH < 4) return null;

  // 2. Downsample the ROI region of the mask into a binary grid
  const dw = Math.ceil(roiW / downsample);
  const dh = Math.ceil(roiH / downsample);
  let grid = new Array<boolean>(dw * dh).fill(false);

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(roiY1 + dy * downsample, imgH - 1);
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(roiX1 + dx * downsample, imgW - 1);
      grid[dy * dw + dx] = globalMask[sy * imgW + sx] >= threshold;
    }
  }

  // 3. Morphological cleanup: close (fill gaps) then open (remove noise)
  grid = cleanMask(grid, dw, dh, MORPHOLOGY_RADIUS);

  // 4. Check if there's enough mask coverage
  let onCount = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) onCount++;
  }
  if (onCount < dw * dh * MIN_CONTOUR_AREA_RATIO) return null;

  // 5. Trace contour (Moore-neighbor, returns largest connected component)
  const contourMask = traceContour(grid, dw, dh);
  if (contourMask.length < 4) return null;

  // 6. Map contour from downsampled ROI space → image space
  const imageContour = contourMask.map((p) => ({
    x: roiX1 + p.x * downsample,
    y: roiY1 + p.y * downsample,
  }));

  // 7. Simplify with RDP
  const simplified = rdpSimplify(imageContour, epsilon, MAX_CONTOUR_POINTS);
  if (simplified.length < 3) return null;

  // 8. Smooth the contour with Chaikin's corner-cutting to reduce jaggedness
  const smoothed = smoothContour(simplified, CHAIKIN_ITERATIONS);

  // 9. Map from image space → view space (cover-aware)
  const viewContour = mapContourToView(smoothed, 1, transform);

  // 10. Build SVG path
  const pathSvg = viewContourToSvgPath(viewContour);
  if (!pathSvg) return null;

  return {
    id: det.id,
    className: det.label,
    confidence: det.score,
    contour: viewContour,
    pathSvg,
    sourceImageSize: { w: imgW, h: imgH },
    box: det.bbox,
  };
}

// ── Legacy exports (kept for backward compatibility during migration) ───

/**
 * @deprecated Use extractOutlines() instead.
 */
export function maskToSvgPath(
  mask: number[],
  width: number,
  height: number,
  threshold: number = 0.4,
  downsample: number = 2
): string {
  const dw = Math.ceil(width / downsample);
  const dh = Math.ceil(height / downsample);
  let grid = new Array<boolean>(dw * dh);

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(dy * downsample, height - 1);
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(dx * downsample, width - 1);
      grid[dy * dw + dx] = mask[sy * width + sx] >= threshold;
    }
  }

  grid = cleanMask(grid, dw, dh, MORPHOLOGY_RADIUS);

  const contour = traceContour(grid, dw, dh);
  if (contour.length < 4) return '';

  const fullRes = contour.map((p) => ({
    x: p.x * downsample,
    y: p.y * downsample,
  }));

  const simplified = rdpSimplify(fullRes, RDP_EPSILON, MAX_CONTOUR_POINTS);
  if (simplified.length < 3) return '';

  return viewContourToSvgPath(simplified);
}

/**
 * @deprecated No longer needed — transforms handle scaling.
 */
export function scaleSvgPath(
  pathData: string,
  scaleX: number,
  scaleY: number
): string {
  return pathData.replace(
    /([MLQ])?\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
    (_match: string, cmd: string, xStr: string, yStr: string) => {
      const x = parseFloat(xStr) * scaleX;
      const y = parseFloat(yStr) * scaleY;
      const prefix = cmd || '';
      return `${prefix}${x.toFixed(1)},${y.toFixed(1)}`;
    }
  );
}
