/**
 * OutlineOverlay — renders SVG contour outlines for segmented objects
 * and falls back to bounding box rectangles for non-segmentable objects.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path, Rect, G, Text as SvgText } from 'react-native-svg';
import { TrackedObject } from '../../utils/scannerTypes';
import { scaleBBox } from '../../utils/bboxUtils';
import { getDisplayName } from '../../utils/applianceClasses';
import { SegmentationOverlay } from '../../hooks/useSegmentationOverlay';

interface OutlineOverlayProps {
  overlays: SegmentationOverlay[];
  trackedObjects: TrackedObject[];
  photoDims: { width: number; height: number };
  cameraLayout: { width: number; height: number };
}

export function OutlineOverlay({
  overlays,
  trackedObjects,
  photoDims,
  cameraLayout,
}: OutlineOverlayProps) {
  // IDs that have SVG outlines — these won't get bounding boxes
  const outlinedIds = new Set(overlays.map((o) => o.trackId));

  // Objects visible in the last few frames that DON'T have an outline
  const fallbackObjects = trackedObjects.filter(
    (obj) => obj.framesSinceLastSeen <= 3 && !outlinedIds.has(obj.id)
  );

  // Objects WITH outlines that are still being tracked
  const activeOverlays = overlays.filter((o) => {
    const obj = trackedObjects.find((t) => t.id === o.trackId);
    return obj && obj.framesSinceLastSeen <= 3;
  });

  return (
    <Svg
      width={cameraLayout.width}
      height={cameraLayout.height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {/* SVG contour outlines for segmented objects */}
      {activeOverlays.map((overlay) => {
        const obj = trackedObjects.find((t) => t.id === overlay.trackId);
        const opacity = obj?.framesSinceLastSeen === 0 ? 1 : 0.5;
        // Find bbox top-left for label positioning
        const scaled = obj
          ? scaleBBox(
              obj.bbox,
              photoDims.width,
              photoDims.height,
              cameraLayout.width,
              cameraLayout.height
            )
          : null;

        return (
          <G key={overlay.trackId} opacity={opacity}>
            <Path
              d={overlay.svgPath}
              stroke={overlay.color}
              strokeWidth={2.5}
              fill={`${overlay.color}15`}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {scaled && (
              <>
                <Rect
                  x={scaled.left - 1}
                  y={scaled.top - 22}
                  width={getDisplayName(overlay.label).length * 7 + 40}
                  height={18}
                  rx={4}
                  fill="rgba(0,0,0,0.7)"
                />
                <SvgText
                  x={scaled.left + 4}
                  y={scaled.top - 8}
                  fontSize={11}
                  fontWeight="600"
                  fill="#fff"
                >
                  {getDisplayName(overlay.label)}{' '}
                  {obj ? `${Math.round(obj.score * 100)}%` : ''}
                </SvgText>
              </>
            )}
          </G>
        );
      })}

      {/* Fallback bounding boxes for non-segmentable objects */}
      {fallbackObjects.map((obj) => {
        const scaled = scaleBBox(
          obj.bbox,
          photoDims.width,
          photoDims.height,
          cameraLayout.width,
          cameraLayout.height
        );
        const opacity = obj.framesSinceLastSeen === 0 ? 1 : 0.5;
        const color = obj.identificationAttempted ? '#FFC107' : '#4CAF50';

        return (
          <G key={obj.id} opacity={opacity}>
            <Rect
              x={scaled.left}
              y={scaled.top}
              width={scaled.width}
              height={scaled.height}
              stroke={color}
              strokeWidth={2}
              fill="rgba(76,175,80,0.08)"
              rx={4}
            />
            {/* Label background */}
            <Rect
              x={scaled.left - 1}
              y={scaled.top - 22}
              width={getDisplayName(obj.label).length * 7 + 40}
              height={18}
              rx={4}
              fill="rgba(0,0,0,0.7)"
            />
            <SvgText
              x={scaled.left + 4}
              y={scaled.top - 8}
              fontSize={11}
              fontWeight="600"
              fill="#fff"
            >
              {getDisplayName(obj.label)} {Math.round(obj.score * 100)}%
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
