import { useRef, useCallback } from 'react';
import { Detection, TrackedObject } from '../utils/scannerTypes';
import { updateTracks } from '../utils/iouTracker';

interface ObjectTrackerResult {
  updateWithDetections: (detections: Detection[]) => TrackedObject[];
  getTracks: () => TrackedObject[];
  reset: () => void;
}

export function useObjectTracker(
  iouThreshold: number = 0.3,
  maxMissedFrames: number = 30
): ObjectTrackerResult {
  const tracksRef = useRef<TrackedObject[]>([]);

  const updateWithDetections = useCallback(
    (detections: Detection[]): TrackedObject[] => {
      const updated = updateTracks(
        tracksRef.current,
        detections,
        iouThreshold,
        maxMissedFrames
      );
      tracksRef.current = updated;
      return updated;
    },
    [iouThreshold, maxMissedFrames]
  );

  const getTracks = useCallback(() => tracksRef.current, []);

  const reset = useCallback(() => {
    tracksRef.current = [];
  }, []);

  return { updateWithDetections, getTracks, reset };
}
