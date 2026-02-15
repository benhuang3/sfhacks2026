/**
 * Converts TrackedObject[] from the on-device detector into the ScanData
 * shape expected by ScanConfirmScreen.
 */

import { TrackedObject } from './scannerTypes';
import { getDisplayName, getCategory } from './applianceClasses';

interface ScanDataFromDetections {
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
  photoUri: string
): ScanDataFromDetections {
  // Sort by confidence descending
  const sorted = [...trackedObjects].sort((a, b) => b.score - a.score);
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

  return {
    candidates,
    bbox: top
      ? [top.bbox.x1, top.bbox.y1, top.bbox.x2, top.bbox.y2]
      : null,
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
