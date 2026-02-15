/**
 * Converts TrackedObject[] from the on-device detector into the ScanData
 * shape expected by ScanConfirmScreen.
 */

import { TrackedObject } from './scannerTypes';
import { getDisplayName, getCategory } from './applianceClasses';

export interface ScanDataFromDetections {
  candidates: Array<{ category: string; confidence: number; modelAsset: string }>;
  bbox: number[] | null;
  detected_appliance: {
    brand: string;
    model: string;
    name: string;
    category: string;
    confidence: number;
  };
  power_profile: null;
  ocr_texts: string[];
  filename: string;
  all_categories?: string[];
  detections: Array<{ label: string; category: string; score: number }>;
}

export function buildScanDataFromDetections(
  trackedObjects: TrackedObject[],
  photoUri: string,
  /** Image dimensions for normalizing bbox to [0,1] range */
  imageDims?: { width: number; height: number },
  /** If provided, this object is used as the primary detection (user tapped it) */
  primaryObjectId?: string
): ScanDataFromDetections {
  // Sort by confidence descending, but pin the primary (user-selected) object first
  const sorted = [...trackedObjects].sort((a, b) => {
    if (primaryObjectId) {
      if (a.id === primaryObjectId) return -1;
      if (b.id === primaryObjectId) return 1;
    }
    return b.score - a.score;
  });
  const top = sorted[0];

  // Build up to 3 candidates from unique categories
  const seen = new Set<string>();
  const candidates = sorted
    .filter((obj) => {
      const cat = getDisplayName(obj.label);
      if (seen.has(cat)) return false;
      seen.add(cat);
      return true;
    })
    .slice(0, 3)
    .map((obj) => ({
      category: getDisplayName(obj.label),
      confidence: obj.score,
      modelAsset: `models/${obj.label.toLowerCase().replace(/ /g, '_')}.glb`,
    }));

  // Normalize bbox to [0,1] range so ScanConfirmScreen can use percentage positioning.
  // Falls back to raw pixel values if image dimensions are unavailable.
  const normalizeBbox = (bbox: TrackedObject['bbox']): number[] => {
    const w = imageDims?.width ?? 1;
    const h = imageDims?.height ?? 1;
    if (imageDims) {
      return [bbox.x1 / w, bbox.y1 / h, bbox.x2 / w, bbox.y2 / h];
    }
    return [bbox.x1, bbox.y1, bbox.x2, bbox.y2];
  };

  return {
    candidates,
    bbox: top ? normalizeBbox(top.bbox) : null,
    detected_appliance: {
      brand: top?.productInfo?.brand ?? 'Unknown',
      model: top?.productInfo?.model ?? 'Unknown',
      name: top ? getDisplayName(top.label) : 'Unknown',
      category: top ? getCategory(top.label) : 'other',
      confidence: top?.score ?? 0,
    },
    power_profile: null,
    ocr_texts: [],
    filename: photoUri.split('/').pop() ?? 'capture.jpg',
    detections: sorted.map((obj) => ({
      label: obj.label,
      category: getCategory(obj.label),
      score: obj.score,
    })),
  };
}
