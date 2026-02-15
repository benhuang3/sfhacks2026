/**
 * Converts a flat pixel probability mask (from DeepLabV3) into an SVG path
 * string that traces the outline of the segmented region.
 *
 * Uses a scanline boundary approach: for each row, find the leftmost and
 * rightmost "on" pixels, then connect left-edge (top→bottom) with right-edge
 * (bottom→top) to form a closed contour.
 */

/**
 * Convert a flat probability mask to an SVG path string.
 *
 * @param mask       Flat array of probabilities (length = width * height)
 * @param width      Image width in pixels
 * @param height     Image height in pixels
 * @param threshold  Probability cutoff (default 0.5)
 * @param step       Sample every Nth row for speed (default 3)
 * @returns          SVG path data string (e.g. "M10,5 L12,8 ... Z"), or '' if no contour
 */
export function maskToSvgPath(
  mask: number[],
  width: number,
  height: number,
  threshold: number = 0.5,
  step: number = 3
): string {
  const leftEdge: { x: number; y: number }[] = [];
  const rightEdge: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y += step) {
    const rowStart = y * width;
    let minX = -1;
    let maxX = -1;

    for (let x = 0; x < width; x++) {
      if (mask[rowStart + x] >= threshold) {
        if (minX === -1) minX = x;
        maxX = x;
      }
    }

    if (minX !== -1) {
      leftEdge.push({ x: minX, y });
      rightEdge.push({ x: maxX, y });
    }
  }

  if (leftEdge.length < 2) return '';

  // Build closed path: left edge top→bottom, right edge bottom→top
  const points = [...leftEdge, ...rightEdge.reverse()];
  const parts = points.map(
    (p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`
  );

  return parts.join(' ') + ' Z';
}

/**
 * Scale all coordinates in an SVG path string by the given factors.
 *
 * @param pathData   SVG path string with M/L/Z commands
 * @param scaleX     Horizontal scale factor (viewWidth / imgWidth)
 * @param scaleY     Vertical scale factor (viewHeight / imgHeight)
 * @returns          Scaled SVG path string
 */
export function scaleSvgPath(
  pathData: string,
  scaleX: number,
  scaleY: number
): string {
  return pathData.replace(
    /([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
    (_, cmd, xStr, yStr) => {
      const x = parseFloat(xStr) * scaleX;
      const y = parseFloat(yStr) * scaleY;
      return `${cmd}${x.toFixed(1)},${y.toFixed(1)}`;
    }
  );
}
