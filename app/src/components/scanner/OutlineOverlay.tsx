/**
 * OutlineOverlay — renders SVG contour outlines for segmented objects
 * and falls back to bounding box rectangles for non-segmentable objects.
 *
 * When onObjectPress is provided, bounding boxes become tappable.
 */

import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import Svg, { Path, Rect, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { TrackedObject } from '../../utils/scannerTypes';
import { getDisplayName } from '../../utils/applianceClasses';
import { SegmentationOverlay } from '../../hooks/useSegmentationOverlay';
import {
  computeImageToViewTransform,
  mapBBoxToView,
} from '../../utils/geometry/transforms';

interface OutlineOverlayProps {
  overlays: SegmentationOverlay[];
  trackedObjects: TrackedObject[];
  photoDims: { width: number; height: number };
  cameraLayout: { width: number; height: number };
  /** Enable debug overlay showing detection boxes, ROI boxes, and contours */
  debug?: boolean;
  /** Called when a bounding box is tapped */
  onObjectPress?: (obj: TrackedObject) => void;
  /** Currently selected object ID (highlighted) */
  selectedObjectId?: string | null;
}

export function OutlineOverlay({
  overlays,
  trackedObjects,
  photoDims,
  cameraLayout,
  debug = false,
  onObjectPress,
  selectedObjectId,
}: OutlineOverlayProps) {
  // IDs that have SVG outlines — these won't get bounding boxes
  const outlinedIds = new Set(overlays.map((o) => o.trackId));

  // Objects visible in the last few frames that DON'T have an outline.
  // When an object is selected (solo mode), only show that one.
  const fallbackObjects = trackedObjects.filter(
    (obj) =>
      obj.framesSinceLastSeen <= 3 &&
      !outlinedIds.has(obj.id) &&
      (!selectedObjectId || obj.id === selectedObjectId)
  );

  // Objects WITH outlines that are still being tracked
  const activeOverlays = overlays.filter((o) => {
    const obj = trackedObjects.find((t) => t.id === o.trackId);
    return obj && obj.framesSinceLastSeen <= 3;
  });

  // Cover-aware transform for debug boxes and fallback bboxes
  const transform = computeImageToViewTransform(
    photoDims.width,
    photoDims.height,
    cameraLayout.width,
    cameraLayout.height,
    'cover'
  );

  // Minimum touch target size (Apple HIG recommends 44pt)
  const MIN_TAP_SIZE = 44;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* SVG layer for visual elements (non-interactive) */}
      <Svg
        width={cameraLayout.width}
        height={cameraLayout.height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {/* Debug: show all detection bounding boxes */}
        {debug &&
          trackedObjects
            .filter((obj) => obj.framesSinceLastSeen <= 3)
            .map((obj) => {
              const box = mapBBoxToView(obj.bbox, transform);
              return (
                <Rect
                  key={`debug-det-${obj.id}`}
                  x={box.left}
                  y={box.top}
                  width={box.width}
                  height={box.height}
                  stroke="#2196F3"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  fill="none"
                />
              );
            })}

        {/* Debug: show segmentation ROI boxes */}
        {debug &&
          activeOverlays
            .filter((o) => o.outline?.box)
            .map((o) => {
              const box = mapBBoxToView(o.outline!.box, transform);
              return (
                <Rect
                  key={`debug-roi-${o.trackId}`}
                  x={box.left}
                  y={box.top}
                  width={box.width}
                  height={box.height}
                  stroke="#FFC107"
                  strokeWidth={1}
                  strokeDasharray="6,3"
                  fill="none"
                />
              );
            })}

        {/* SVG contour outlines for segmented objects */}
        {activeOverlays.map((overlay) => {
          const obj = trackedObjects.find((t) => t.id === overlay.trackId);
          const opacity = obj?.framesSinceLastSeen === 0 ? 1 : 0.5;

          // Use contour bounding box for label positioning
          const contour = overlay.outline?.contour;
          let labelX = 0;
          let labelY = 0;
          if (contour && contour.length > 0) {
            let minX = Infinity, minY = Infinity;
            for (const p of contour) {
              if (p.x < minX) minX = p.x;
              if (p.y < minY) minY = p.y;
            }
            labelX = minX;
            labelY = minY;
          } else if (obj) {
            const box = mapBBoxToView(obj.bbox, transform);
            labelX = box.left;
            labelY = box.top;
          }

          // Clamp label so it doesn't render above the viewport
          const clampedLabelY = Math.max(labelY, 24);

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
              <Rect
                x={labelX - 1}
                y={clampedLabelY - 22}
                width={getDisplayName(overlay.label).length * 7 + 40}
                height={18}
                rx={4}
                fill="rgba(0,0,0,0.7)"
              />
              <SvgText
                x={labelX + 4}
                y={clampedLabelY - 8}
                fontSize={11}
                fontWeight="600"
                fill="#fff"
              >
                {getDisplayName(overlay.label)}{' '}
                {obj ? `${Math.round(obj.score * 100)}%` : ''}
              </SvgText>
            </G>
          );
        })}

        {/* Fallback bounding boxes (visual only) */}
        {fallbackObjects.map((obj) => {
          const box = mapBBoxToView(obj.bbox, transform);
          const opacity = obj.framesSinceLastSeen === 0 ? 1 : 0.5;
          const isSelected = obj.id === selectedObjectId;
          const color = isSelected
            ? '#2196F3'
            : obj.identificationAttempted
            ? '#FFC107'
            : '#4CAF50';

          // Clamp label so it doesn't render above the viewport
          const clampedTop = Math.max(box.top, 24);

          return (
            <G key={obj.id} opacity={opacity}>
              <Rect
                x={box.left}
                y={box.top}
                width={box.width}
                height={box.height}
                stroke={color}
                strokeWidth={isSelected ? 3 : 2}
                fill={isSelected ? 'rgba(33,150,243,0.15)' : 'rgba(76,175,80,0.08)'}
                rx={4}
              />
              {/* Label background */}
              <Rect
                x={box.left - 1}
                y={clampedTop - 22}
                width={getDisplayName(obj.label).length * 7 + 40}
                height={18}
                rx={4}
                fill="rgba(0,0,0,0.7)"
              />
              <SvgText
                x={box.left + 4}
                y={clampedTop - 8}
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

      {/* Tappable overlay layer (only when onObjectPress provided and no object selected yet) */}
      {onObjectPress && !selectedObjectId &&
        fallbackObjects
          .filter((obj) => obj.framesSinceLastSeen === 0)
          .map((obj) => {
            const box = mapBBoxToView(obj.bbox, transform);
            const isSelected = obj.id === selectedObjectId;

            // Enforce minimum touch target size, expanding from center
            const tapW = Math.max(box.width, MIN_TAP_SIZE);
            const tapH = Math.max(box.height, MIN_TAP_SIZE);
            const tapLeft = box.left - (tapW - box.width) / 2;
            const tapTop = box.top - (tapH - box.height) / 2;

            return (
              <TouchableOpacity
                key={`tap-${obj.id}`}
                activeOpacity={0.7}
                onPress={() => onObjectPress(obj)}
                style={[
                  styles.tapTarget,
                  {
                    left: tapLeft,
                    top: tapTop,
                    width: tapW,
                    height: tapH,
                  },
                ]}
              >
                {/* Add button in corner */}
                <View style={[styles.addBadge, isSelected && styles.addBadgeSelected]}>
                  <Ionicons
                    name={isSelected ? 'checkmark' : 'add'}
                    size={16}
                    color="#fff"
                  />
                </View>
              </TouchableOpacity>
            );
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  tapTarget: {
    position: 'absolute',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 4,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(76,175,80,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBadgeSelected: {
    backgroundColor: '#2196F3',
  },
});
