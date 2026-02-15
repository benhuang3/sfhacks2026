import { Detection, TrackedObject } from './scannerTypes';
import { computeIoU, bboxArea } from './bboxUtils';

/** Simple unique ID generator — avoids uuid's crypto.getRandomValues() requirement */
let _idCounter = 0;
function generateId(): string {
  return `trk_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}

const DEFAULT_IOU_THRESHOLD = 0.3;
const DEFAULT_MAX_MISSED_FRAMES = 5;

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

  // Prune overlapping tracks: if a lower-confidence track significantly overlaps
  // a higher-confidence track, drop it immediately instead of letting it age out.
  return pruneOverlappingTracks(updatedTracks);
}

const OVERLAP_IOU_THRESHOLD = 0.35;
const OVERLAP_CONTAINMENT_THRESHOLD = 0.6;

function pruneOverlappingTracks(tracks: TrackedObject[]): TrackedObject[] {
  if (tracks.length <= 1) return tracks;

  // Sort by score descending — higher confidence tracks survive
  const sorted = [...tracks].sort((a, b) => b.score - a.score);
  const dropped = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (dropped.has(sorted[i].id)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (dropped.has(sorted[j].id)) continue;

      const iou = computeIoU(sorted[i].bbox, sorted[j].bbox);
      if (iou >= OVERLAP_IOU_THRESHOLD) {
        dropped.add(sorted[j].id);
        continue;
      }

      // Check containment: is the smaller box mostly inside the larger one?
      const areaI = bboxArea(sorted[i].bbox);
      const areaJ = bboxArea(sorted[j].bbox);
      const smallBox = areaI < areaJ ? sorted[i].bbox : sorted[j].bbox;
      const bigBox = areaI < areaJ ? sorted[j].bbox : sorted[i].bbox;

      const xA = Math.max(bigBox.x1, smallBox.x1);
      const yA = Math.max(bigBox.y1, smallBox.y1);
      const xB = Math.min(bigBox.x2, smallBox.x2);
      const yB = Math.min(bigBox.y2, smallBox.y2);
      const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
      const smallArea = (smallBox.x2 - smallBox.x1) * (smallBox.y2 - smallBox.y1);
      const cont = smallArea > 0 ? intersection / smallArea : 0;

      if (cont >= OVERLAP_CONTAINMENT_THRESHOLD) {
        dropped.add(sorted[j].id);
      }
    }
  }

  return tracks.filter((t) => !dropped.has(t.id));
}
