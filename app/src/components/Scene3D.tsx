/**
 * Scene3D — Enhanced 3D scene with isometric SVG appliance models
 *
 * Renders devices using full SVG appliance illustrations
 * instead of plain emoji boxes. Works in Expo Go.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import type { HomeScene, SceneObject } from '../services/apiClient';
import { Appliance3DModel } from './Appliance3DModel';

const { width: SCREEN_W } = Dimensions.get('window');

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
  const objects: SceneObject[] = useMemo(() => {
    const all = scene?.objects ?? [];
    if (!selectedRoomId) return all;
    return all.filter(o => o.roomId === selectedRoomId);
  }, [scene, selectedRoomId]);

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

  return (
    <View style={[styles.container, { height }]}>
      {/* Room header */}
      <View style={styles.roomHeader}>
        <Text style={styles.roomLabel}>{roomName}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{objects.length} device{objects.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Room perspective container */}
      <View style={styles.room}>
        {/* Back wall gradient */}
        <View style={styles.wallBack} />
        <View style={styles.wallLeft} />
        <View style={styles.wallRight} />
        <View style={styles.floor} />

        {/* Devices grid with 3D models */}
        <ScrollView
          contentContainerStyle={styles.devicesGrid}
          showsVerticalScrollIndicator={false}
        >
          {objects.map((obj, i) => (
            <TouchableOpacity
              key={obj.objectId || obj.deviceId || `${i}`}
              style={styles.deviceSlot}
              activeOpacity={0.7}
              onPress={() => onDevicePress?.(obj.deviceId)}
            >
              <View style={styles.deviceModelWrapper}>
                <Appliance3DModel
                  category={obj.category}
                  size={64}
                  showLabel={false}
                />
              </View>
              <Text style={styles.deviceLabel} numberOfLines={1}>
                {obj.category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  roomLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
  room: {
    flex: 1,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    marginHorizontal: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  wallBack: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '40%',
    backgroundColor: '#1a1a3a',
  },
  wallLeft: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: '6%',
    backgroundColor: '#151530',
  },
  wallRight: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: '6%',
    backgroundColor: '#151530',
  },
  floor: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '40%',
    backgroundColor: '#0d0d1a',
  },
  devicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  deviceSlot: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 8,
    width: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  deviceModelWrapper: {
    marginBottom: 4,
  },
  deviceLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 72,
  },
});
