import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

interface DetectionLabelProps {
  label: string;
  confidence: number;
  color: string;
}

export function DetectionLabel({ label, confidence, color }: DetectionLabelProps) {
  return (
    <View style={[styles.container, { backgroundColor: color }]}>
      <Text style={styles.text}>
        {label} {Math.round(confidence * 100)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
