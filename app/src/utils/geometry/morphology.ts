/**
 * geometry/morphology.ts — Binary morphological operations for small kernels.
 *
 * Implements dilation, erosion, opening, and closing on a binary mask
 * stored as a boolean flat array (row-major). Pure TypeScript, no deps.
 */

/**
 * Dilate a binary mask: expand "on" regions by `radius` pixels.
 * Uses a circular-ish structuring element (all offsets within Manhattan distance ≤ radius).
 */
export function dilate(
  grid: boolean[],
  w: number,
  h: number,
  radius: number = 1
): boolean[] {
  const offsets = buildKernel(radius);
  const out = new Array<boolean>(w * h).fill(false);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y * w + x]) continue;
      // Spread to all neighbors within kernel
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          out[ny * w + nx] = true;
        }
      }
    }
  }

  return out;
}

/**
 * Erode a binary mask: shrink "on" regions by `radius` pixels.
 * A pixel stays "on" only if ALL kernel neighbors are also "on".
 */
export function erode(
  grid: boolean[],
  w: number,
  h: number,
  radius: number = 1
): boolean[] {
  const offsets = buildKernel(radius);
  const out = new Array<boolean>(w * h).fill(false);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y * w + x]) continue;
      let allOn = true;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || !grid[ny * w + nx]) {
          allOn = false;
          break;
        }
      }
      out[y * w + x] = allOn;
    }
  }

  return out;
}

/**
 * Morphological closing: dilate then erode.
 * Fills small holes and gaps in the mask.
 */
export function close(
  grid: boolean[],
  w: number,
  h: number,
  radius: number = 1
): boolean[] {
  return erode(dilate(grid, w, h, radius), w, h, radius);
}

/**
 * Morphological opening: erode then dilate.
 * Removes small noise blobs from the mask.
 */
export function open(
  grid: boolean[],
  w: number,
  h: number,
  radius: number = 1
): boolean[] {
  return dilate(erode(grid, w, h, radius), w, h, radius);
}

/**
 * Close then open — fills holes first, then removes noise.
 */
export function cleanMask(
  grid: boolean[],
  w: number,
  h: number,
  radius: number = 1
): boolean[] {
  return open(close(grid, w, h, radius), w, h, radius);
}

/**
 * Build kernel offsets for a given radius.
 * Uses diamond shape (Manhattan distance ≤ radius).
 */
function buildKernel(radius: number): [number, number][] {
  const offsets: [number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= radius) {
        offsets.push([dx, dy]);
      }
    }
  }
  return offsets;
}
