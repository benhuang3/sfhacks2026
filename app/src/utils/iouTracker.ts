import { Detection, TrackedObject } from './scannerTypes';
import { computeIoU } from './bboxUtils';

/** Simple unique ID generator — avoids uuid's crypto.getRandomValues() requirement */
let _idCounter = 0;
function generateId(): string {
  return `trk_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}

const DEFAULT_IOU_THRESHOLD = 0.3;
const DEFAULT_MAX_MISSED_FRAMES = 30;

/**
 * Simple IoU-based object tracker.
 * Matches new detections to existing tracks using greedy IoU assignment.
 * Appliances are stationary, so no motion model (Kalman filter) is needed.
 */
export function updateTracks(
  currentTracks: TrackedObject[],
  newDetections: Detection[],
  iouThreshold: number = DEFAULT_IOU_THRESHOLD,
  maxMissedFrames: number = DEFAULT_MAX_MISSED_FRAMES
): TrackedObject[] {
  // Build IoU matrix: [trackIdx][detIdx] = IoU score
  const iouMatrix: { trackIdx: number; detIdx: number; iou: number }[] = [];

  for (let t = 0; t < currentTracks.length; t++) {
    for (let d = 0; d < newDetections.length; d++) {
      const iou = computeIoU(currentTracks[t].bbox, newDetections[d].bbox);
      if (iou >= iouThreshold) {
        iouMatrix.push({ trackIdx: t, detIdx: d, iou });
      }
    }
  }

  // Sort by IoU descending for greedy assignment
  iouMatrix.sort((a, b) => b.iou - a.iou);

  const matchedTracks = new Set<number>();
  const matchedDetections = new Set<number>();
  const updatedTracks: TrackedObject[] = [];

  // Greedy assignment: pair highest IoU first
  for (const { trackIdx, detIdx } of iouMatrix) {
    if (matchedTracks.has(trackIdx) || matchedDetections.has(detIdx)) continue;

    matchedTracks.add(trackIdx);
    matchedDetections.add(detIdx);

    const track = currentTracks[trackIdx];
    const det = newDetections[detIdx];

    updatedTracks.push({
      ...track,
      bbox: det.bbox,
      label: det.label,
      score: det.score,
      framesSinceLastSeen: 0,
    });
  }

  // Age unmatched tracks
  for (let t = 0; t < currentTracks.length; t++) {
    if (matchedTracks.has(t)) continue;

    const track = currentTracks[t];
    const aged = track.framesSinceLastSeen + 1;

    if (aged <= maxMissedFrames) {
      updatedTracks.push({
        ...track,
        framesSinceLastSeen: aged,
      });
    }
    // else: track is removed (exceeded max missed frames)
  }

  // Create new tracks for unmatched detections
  for (let d = 0; d < newDetections.length; d++) {
    if (matchedDetections.has(d)) continue;

    const det = newDetections[d];
    updatedTracks.push({
      id: generateId(),
      bbox: det.bbox,
      label: det.label,
      score: det.score,
      framesSinceLastSeen: 0,
      identificationAttempted: false,
    });
  }

  return updatedTracks;
}
