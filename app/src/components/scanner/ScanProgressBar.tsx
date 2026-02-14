import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

interface ScanProgressBarProps {
  detected: number;
  confirmed: number;
}

export function ScanProgressBar({ detected, confirmed }: ScanProgressBarProps) {
  if (detected === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.text}>
          {confirmed}/{detected} appliances confirmed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
