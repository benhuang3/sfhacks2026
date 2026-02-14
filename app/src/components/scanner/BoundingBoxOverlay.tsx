import React from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { TrackedObject } from '../../utils/scannerTypes';
import { getDisplayName } from '../../utils/applianceClasses';

interface BoundingBoxOverlayProps {
  trackedObjects: TrackedObject[];
}

function getBoxColor(obj: TrackedObject): string {
  if (obj.productInfo?.confirmed) return '#4CAF50'; // green = confirmed
  if (obj.identificationAttempted) return '#FF9800'; // orange = ID attempted
  if (obj.framesSinceLastSeen === 0) return '#2196F3'; // blue = actively tracked
  return '#9E9E9E'; // gray = stale
}

export function BoundingBoxOverlay({ trackedObjects }: BoundingBoxOverlayProps) {
  const { width: viewWidth, height: viewHeight } = useWindowDimensions();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {trackedObjects.map((obj) => {
        const color = getBoxColor(obj);

        // The bbox coordinates are in model space (0-320 for SSD).
        // Scale them to the camera view dimensions.
        const scaleX = viewWidth / 320;
        const scaleY = viewHeight / 320;

        const boxStyle = {
          left: obj.bbox.x1 * scaleX,
          top: obj.bbox.y1 * scaleY,
          width: (obj.bbox.x2 - obj.bbox.x1) * scaleX,
          height: (obj.bbox.y2 - obj.bbox.y1) * scaleY,
          borderColor: color,
        };

        const displayName = obj.productInfo?.displayName || getDisplayName(obj.label);
        const confidence = Math.round(obj.score * 100);

        return (
          <View key={obj.id} style={[styles.box, boxStyle]}>
            <View style={[styles.label, { backgroundColor: color }]}>
              <Text style={styles.labelText} numberOfLines={1}>
                {displayName} {confidence}%
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
  },
  label: {
    position: 'absolute',
    top: -22,
    left: -2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
