/**
 * Scene3D — cross-platform 3D scene for SmartGrid Home
 *
 * On native (Expo Go / dev-client) this renders colored device boxes
 * using plain React-Native views with a perspective transform —
 * looks 3D-ish without requiring expo-gl or expo-three at bundle time.
 *
 * For a full WebGL scene, swap this file with an expo-three implementation
 * once a dev-client build is set up.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import type { HomeScene, SceneObject } from '../services/apiClient';

const { width: SCREEN_W } = Dimensions.get('window');

// Category → color mapping
const CATEGORY_COLORS: Record<string, string> = {
  'Television': '#2196F3', 'TV': '#2196F3',
  'Laptop': '#4CAF50', 'Monitor': '#00BCD4',
  'Microwave': '#FF9800', 'Oven': '#F44336',
  'Toaster': '#FF5722', 'Refrigerator': '#03A9F4',
  'Fridge': '#03A9F4', 'Lamp': '#FFC107',
  'Light Bulb': '#FFC107', 'Router': '#607D8B',
  'Fan': '#009688', 'Air Conditioner': '#00BCD4',
  'Gaming Console': '#673AB7', 'Washing Machine': '#9C27B0',
  'Hair Dryer': '#E91E63', 'Dryer': '#E91E63',
  'Dishwasher': '#795548', 'Water Heater': '#FF7043',
  'Space Heater': '#FF5722', 'Phone Charger': '#78909C',
};

const CATEGORY_ICONS: Record<string, string> = {
  'Television': '📺', 'TV': '📺', 'Laptop': '💻', 'Monitor': '🖥️',
  'Microwave': '🍿', 'Oven': '🍳', 'Toaster': '🍞',
  'Refrigerator': '🧊', 'Fridge': '🧊', 'Hair Dryer': '💨',
  'Phone Charger': '🔌', 'Washing Machine': '🫧', 'Dryer': '👕',
  'Air Conditioner': '❄️', 'Space Heater': '🔥',
  'Light Bulb': '💡', 'Lamp': '💡', 'Dishwasher': '🍽️',
  'Gaming Console': '🎮', 'Router': '📡', 'Fan': '🌀',
  'Water Heater': '🚿',
};

interface Scene3DProps {
  scene?: HomeScene | null;
  selectedRoomId?: string;
  height?: number;
  onDevicePress?: (deviceId: string) => void;
  loading?: boolean;
}

export function Scene3D({
  scene,
  selectedRoomId,
  height = 300,
  onDevicePress,
}: Scene3DProps) {
  // Filter objects by selected room
  const objects: SceneObject[] = useMemo(() => {
    const all = scene?.objects ?? [];
    if (!selectedRoomId) return all;
    return all.filter(o => o.roomId === selectedRoomId);
  }, [scene, selectedRoomId]);

  // Room name for header
  const roomName = useMemo(() => {
    if (!selectedRoomId) return 'All Rooms';
    const room = scene?.rooms?.find(r => r.roomId === selectedRoomId);
    return room?.name ?? selectedRoomId;
  }, [scene, selectedRoomId]);

  if (!scene || objects.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.emptyRoom}>
          <Text style={{ fontSize: 48 }}>🏠</Text>
          <Text style={styles.emptyText}>
            {scene ? 'No devices in this room' : 'No scene data'}
          </Text>
          <Text style={styles.hintText}>Scan an appliance to add it here</Text>
        </View>
      </View>
    );
  }

  // Layout objects in a grid
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(objects.length))));

  return (
    <View style={[styles.container, { height }]}>
      {/* Perspective room */}
      <View style={styles.room}>
        {/* Back wall */}
        <View style={styles.wallBack}>
          <Text style={styles.roomLabel}>{roomName}</Text>
        </View>
        {/* Left wall */}
        <View style={styles.wallLeft} />
        {/* Right wall */}
        <View style={styles.wallRight} />
        {/* Floor */}
        <View style={styles.floor} />

        {/* Device objects */}
        {objects.map((obj, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const spacing = 85 / (cols + 1);
          const left = spacing * (col + 1);
          const top = 25 + row * 22;
          const color = CATEGORY_COLORS[obj.category] ?? '#888';
          const icon = CATEGORY_ICONS[obj.category] ?? '🔌';

          return (
            <TouchableOpacity
              key={obj.objectId || obj.deviceId || `${i}`}
              style={[styles.device, {
                left: `${left}%` as any,
                top: `${top}%` as any,
                backgroundColor: color,
                shadowColor: color,
              }]}
              activeOpacity={0.7}
              onPress={() => onDevicePress?.(obj.deviceId)}
            >
              <Text style={styles.deviceIcon}>{icon}</Text>
              <Text style={styles.deviceLabel} numberOfLines={1}>{obj.category}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Device count badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{objects.length} device{objects.length !== 1 ? 's' : ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0d0d1a',
  },
  emptyRoom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d0d1a',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    fontSize: 14,
  },
  hintText: {
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    fontSize: 12,
  },
  room: {
    flex: 1,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  wallBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: '#1a1a3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wallLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '8%',
    backgroundColor: '#151530',
  },
  wallRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '8%',
    backgroundColor: '#151530',
  },
  floor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: '#0d0d1a',
  },
  roomLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  device: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    transform: [
      { perspective: 600 },
      { rotateX: '-5deg' },
    ] as any,
  },
  deviceIcon: {
    fontSize: 22,
  },
  deviceLabel: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },
});
