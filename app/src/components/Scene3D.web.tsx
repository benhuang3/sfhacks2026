import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { HomeScene } from '../services/apiClient';

interface Scene3DProps {
  scene?: HomeScene | null;
  selectedRoomId?: string;
  height?: number;
  onDevicePress?: (deviceId: string) => void;
  loading?: boolean;
}

// Web fallback: simple static preview (no native GL / three dependencies)
export function Scene3D({ scene, height = 280 }: Scene3DProps) {
  const deviceCount = scene?.objects?.length ?? 0;
  return (
    <View style={[styles.container, { height }]}> 
      <View style={styles.previewBox}>
        <Text style={styles.title}>3D Preview (Web)</Text>
        <Text style={styles.subtitle}>{deviceCount} device{deviceCount !== 1 ? 's' : ''}</Text>
        <Text style={styles.hint}>Open on device or Expo Go for interactive 3D.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  previewBox: { width: '100%', height: '100%', borderRadius: 12, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#666' },
  hint: { fontSize: 12, color: '#999', marginTop: 8 },
});
