/**
 * geometry/transforms.ts — Image ↔ View coordinate mapping.
 *
 * Handles aspect-fill ("cover") and aspect-fit ("contain") resize modes,
 * accounting for the crop/letterbox offset that occurs when image aspect
 * ratio differs from view aspect ratio.
 */

import { Point } from './contours';

export interface ImageToViewTransform {
  /** Uniform scale factor applied to the image */
  scale: number;
  /** Horizontal offset (negative when image is cropped on the left) */
  offsetX: number;
  /** Vertical offset (negative when image is cropped on the top) */
  offsetY: number;
  /** Original image dimensions */
  imageW: number;
  imageH: number;
  /** View (screen) dimensions */
  viewW: number;
  viewH: number;
}

/**
 * Compute the transform that maps image-pixel coordinates to view (screen) coordinates.
 *
 * In "cover" mode (aspect-fill), the image is scaled so the shorter dimension
 * fills the view, and the longer dimension is cropped symmetrically.
 *
 * In "contain" mode (aspect-fit), the image is scaled so the longer dimension
 * fits the view, and the shorter dimension is letterboxed.
 *
 * @param imageW  Image width in pixels
 * @param imageH  Image height in pixels
 * @param viewW   View width in points/pixels
 * @param viewH   View height in points/pixels
 * @param mode    'cover' (aspect-fill, default) or 'contain' (aspect-fit)
 */
export function computeImageToViewTransform(
  imageW: number,
  imageH: number,
  viewW: number,
  viewH: number,
  mode: 'cover' | 'contain' = 'cover'
): ImageToViewTransform {
  const imageAspect = imageW / imageH;
  const viewAspect = viewW / viewH;

  let scale: number;

  if (mode === 'cover') {
    // Scale so the image fully covers the view (some parts may be cropped)
    scale = imageAspect > viewAspect
      ? viewH / imageH   // image is wider than view → scale by height, crop width
      : viewW / imageW;  // image is taller than view → scale by width, crop height
  } else {
    // Scale so the image fully fits inside the view (letterboxed)
    scale = imageAspect > viewAspect
      ? viewW / imageW   // image is wider → scale by width, letterbox height
      : viewH / imageH;  // image is taller → scale by height, letterbox width
  }

  // The image is centered in the view; compute offset
  const scaledW = imageW * scale;
  const scaledH = imageH * scale;
  const offsetX = (viewW - scaledW) / 2;
  const offsetY = (viewH - scaledH) / 2;

  return { scale, offsetX, offsetY, imageW, imageH, viewW, viewH };
}

/**
 * Map a point from image-pixel coordinates to view (screen) coordinates.
 */
export function mapImagePointToView(
  x: number,
  y: number,
  transform: ImageToViewTransform
): Point {
  return {
    x: x * transform.scale + transform.offsetX,
    y: y * transform.scale + transform.offsetY,
  };
}

/**
 * Map a point from mask-pixel coordinates to view coordinates.
 * If the mask was downsampled, scale up first.
 *
 * @param x           X in mask space
 * @param y           Y in mask space
 * @param downsample  Downsample factor (mask was shrunk by this factor)
 * @param transform   Image-to-view transform
 */
export function mapMaskPointToView(
  x: number,
  y: number,
  downsample: number,
  transform: ImageToViewTransform
): Point {
  // Map mask coords → image coords → view coords
  const imgX = x * downsample;
  const imgY = y * downsample;
  return mapImagePointToView(imgX, imgY, transform);
}

/**
 * Map an entire contour from mask space to view space.
 */
export function mapContourToView(
  contour: Point[],
  downsample: number,
  transform: ImageToViewTransform
): Point[] {
  return contour.map((p) => mapMaskPointToView(p.x, p.y, downsample, transform));
}

/**
 * Map a bounding box {x1,y1,x2,y2} from image space to view space.
 */
export function mapBBoxToView(
  bbox: { x1: number; y1: number; x2: number; y2: number },
  transform: ImageToViewTransform
): { left: number; top: number; width: number; height: number } {
  const tl = mapImagePointToView(bbox.x1, bbox.y1, transform);
  const br = mapImagePointToView(bbox.x2, bbox.y2, transform);
  return {
    left: tl.x,
    top: tl.y,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

/**
 * Build an SVG path string from view-space points with smooth bezier curves.
 */
export function viewContourToSvgPath(points: Point[]): string {
  if (points.length < 3) return '';

  const parts: string[] = [];
  const mid0 = midpoint(points[points.length - 1], points[0]);
  parts.push(`M${mid0.x.toFixed(1)},${mid0.y.toFixed(1)}`);

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const mid = midpoint(curr, next);
    parts.push(
      `Q${curr.x.toFixed(1)},${curr.y.toFixed(1)} ${mid.x.toFixed(1)},${mid.y.toFixed(1)}`
    );
  }

  parts.push('Z');
  return parts.join(' ');
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
