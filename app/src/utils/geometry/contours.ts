/**
 * geometry/contours.ts — Moore-neighbor contour tracing + RDP simplification.
 *
 * Traces ordered contours around connected components in a binary mask.
 * Returns polyline points in mask-pixel coordinates, ordered and closed.
 */

export type Point = { x: number; y: number };

// Moore neighborhood: 8 directions clockwise starting from East
//   5 6 7
//   4 . 0
//   3 2 1
const MOORE_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const MOORE_DY = [0, 1, 1, 1, 0, -1, -1, -1];

/**
 * Trace the outer contour of the largest connected component in a binary grid.
 *
 * Uses Moore-neighbor tracing (a.k.a. radial sweep) to walk the boundary
 * in clockwise order starting from the first "on" pixel found via raster scan.
 *
 * @param grid   Boolean flat array (row-major)
 * @param w      Grid width
 * @param h      Grid height
 * @returns      Ordered boundary points (closed loop), or [] if empty
 */
export function traceContour(grid: boolean[], w: number, h: number): Point[] {
  // Find all connected components, return the largest one's contour
  const visited = new Uint8Array(w * h);
  let bestContour: Point[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y * w + x] || visited[y * w + x]) continue;

      // Only start tracing from boundary pixels (pixels with at least one OFF neighbor)
      let isBoundary = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      if (!isBoundary) {
        for (let d = 0; d < 8; d++) {
          const nx = x + MOORE_DX[d];
          const ny = y + MOORE_DY[d];
          if (!grid[ny * w + nx]) {
            isBoundary = true;
            break;
          }
        }
      }

      if (!isBoundary) {
        visited[y * w + x] = 1;
        continue;
      }

      const contour = traceSingleContour(grid, w, h, x, y, visited);
      if (contour.length > bestContour.length) {
        bestContour = contour;
      }
    }
  }

  return bestContour;
}

/**
 * Trace a single contour starting from pixel (startX, startY).
 * Marks boundary pixels in `visited`.
 */
function traceSingleContour(
  grid: boolean[],
  w: number,
  h: number,
  startX: number,
  startY: number,
  visited: Uint8Array
): Point[] {
  const contour: Point[] = [];
  let x = startX;
  let y = startY;

  // Entry direction: we entered from the West (left), so start scanning from dir=6 (NW)
  let dir = 6;

  const maxSteps = w * h * 2; // safety limit
  let steps = 0;

  do {
    contour.push({ x, y });
    visited[y * w + x] = 1;

    // Scan Moore neighbors clockwise starting from (dir+5)%8
    // This is the standard backtrack: go back to the pixel we came from,
    // then scan clockwise.
    let scanStart = (dir + 5) % 8;
    let found = false;

    for (let i = 0; i < 8; i++) {
      const d = (scanStart + i) % 8;
      const nx = x + MOORE_DX[d];
      const ny = y + MOORE_DY[d];

      if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny * w + nx]) {
        x = nx;
        y = ny;
        dir = d;
        found = true;
        break;
      }
    }

    if (!found) break; // isolated pixel
    steps++;
  } while ((x !== startX || y !== startY) && steps < maxSteps);

  return contour;
}

/**
 * Trace ALL contours in the grid (not just the largest).
 * Returns array of contours sorted by size (largest first).
 */
export function traceAllContours(
  grid: boolean[],
  w: number,
  h: number
): Point[][] {
  const visited = new Uint8Array(w * h);
  const contours: Point[][] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y * w + x] || visited[y * w + x]) continue;

      // Check if this is a boundary pixel
      let isBoundary = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      if (!isBoundary) {
        for (let d = 0; d < 8; d++) {
          const nx = x + MOORE_DX[d];
          const ny = y + MOORE_DY[d];
          if (!grid[ny * w + nx]) {
            isBoundary = true;
            break;
          }
        }
      }

      if (!isBoundary) {
        visited[y * w + x] = 1;
        continue;
      }

      const contour = traceSingleContour(grid, w, h, x, y, visited);
      if (contour.length >= 3) {
        contours.push(contour);
      }
    }
  }

  // Sort by area (largest first)
  contours.sort((a, b) => contourArea(b) - contourArea(a));
  return contours;
}

/**
 * Approximate area of a contour using the shoelace formula.
 */
function contourArea(pts: Point[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Ramer-Douglas-Peucker line simplification.
 *
 * @param points  Ordered polyline points
 * @param epsilon Max perpendicular distance to drop a point
 * @param maxPts  Cap output at this many points (default 200)
 */
export function rdpSimplify(
  points: Point[],
  epsilon: number,
  maxPts: number = 200
): Point[] {
  if (points.length <= 2) return points;

  let result = rdpRecurse(points, epsilon);

  // If still too many points, increase epsilon iteratively
  let e = epsilon;
  while (result.length > maxPts && e < 100) {
    e *= 1.5;
    result = rdpRecurse(points, e);
  }

  return result;
}

function rdpRecurse(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpRecurse(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpRecurse(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.sqrt(lenSq);
}

/**
 * Build a smooth SVG path from contour points using quadratic bezier curves.
 */
export function contourToSvgPath(points: Point[]): string {
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

/**
 * Build a straight-line SVG path (no curves).
 */
export function contourToLinePath(points: Point[]): string {
  if (points.length < 3) return '';
  const parts = points.map(
    (p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
  );
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Smooth a closed contour using Chaikin's corner-cutting algorithm.
 * Each iteration replaces each edge with two new points at 1/4 and 3/4,
 * converging toward a smooth B-spline curve.
 *
 * @param points     Closed contour points
 * @param iterations Number of smoothing passes (default 2)
 */
export function smoothContour(points: Point[], iterations: number = 2): Point[] {
  if (points.length < 3) return points;

  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: Point[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      smoothed.push({
        x: curr.x * 0.75 + next.x * 0.25,
        y: curr.y * 0.75 + next.y * 0.25,
      });
      smoothed.push({
        x: curr.x * 0.25 + next.x * 0.75,
        y: curr.y * 0.25 + next.y * 0.75,
      });
    }
    pts = smoothed;
  }

  return pts;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
