/**
 * Maps COCO appliance class labels (from SSDLite) to DeepLabV3 label indices.
 * Only classes present in both models can get outline tracing.
 */

import { DeeplabLabel } from '../shims/exec';

/** COCO class name → DeepLabV3 label index (tech devices only) */
export const COCO_TO_DEEPLAB: Record<string, number> = {
  'tv':            DeeplabLabel.TVMONITOR,   // 20
};

/** Check if a COCO class label can be segmented by DeepLabV3 */
export function isSegmentable(cocoLabel: string): boolean {
  return cocoLabel in COCO_TO_DEEPLAB;
}

/** Get the DeepLabV3 label index for a COCO class, or null if not segmentable */
export function getDeeplabLabel(cocoLabel: string): number | null {
  return COCO_TO_DEEPLAB[cocoLabel] ?? null;
}

/** Get all DeepLabV3 label indices that we care about (for classesOfInterest) */
export function getSegmentableDeeplabLabels(): number[] {
  return Object.values(COCO_TO_DEEPLAB);
}
