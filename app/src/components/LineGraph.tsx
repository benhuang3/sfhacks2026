/**
 * LineGraph — Reusable line chart for cost/usage trends.
 * Uses react-native-chart-kit (already installed).
 */

import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

export interface LineGraphProps {
  /** Data points (Y axis) */
  data: number[];
  /** Labels (X axis) */
  labels: string[];
  /** Chart title */
  title?: string;
  /** Y-axis suffix, e.g. "kWh" or "$" */
  yAxisSuffix?: string;
  /** Y-axis prefix, e.g. "$" */
  yAxisPrefix?: string;
  /** Accent color for the line */
  lineColor?: string;
  /** Background gradient start */
  bgFrom?: string;
  /** Background gradient end */
  bgTo?: string;
  /** Card background */
  cardBg?: string;
  /** Text color */
  textColor?: string;
  /** Height of the chart */
  height?: number;
}

export function LineGraph({
  data,
  labels,
  title,
  yAxisSuffix = '',
  yAxisPrefix = '',
  lineColor = '#4CAF50',
  bgFrom = '#1a1a2e',
  bgTo = '#16213e',
  cardBg = '#12121a',
  textColor = '#ffffff',
  height = 220,
}: LineGraphProps) {
  const { width: screenWidth } = useWindowDimensions();

  // Guard: need at least 2 data points
  if (!data || data.length < 2) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg, minHeight: height }]}>
        {title && <Text style={[styles.title, { color: textColor }]}>{title}</Text>}
        <Text style={[styles.empty, { color: textColor + '88' }]}>Not enough data for chart</Text>
      </View>
    );
  }

  const chartWidth = Math.max(screenWidth - 48, 200); // 24px padding each side, min 200

  return (
    <View style={[styles.card, { backgroundColor: cardBg, minHeight: height + 40 }]}>
      {title && <Text style={[styles.title, { color: textColor }]}>{title}</Text>}
      <LineChart
        data={{
          labels,
          datasets: [{ data, color: () => lineColor, strokeWidth: 2 }],
        }}
        width={chartWidth}
        height={height}
        yAxisSuffix={yAxisSuffix}
        yAxisLabel={yAxisPrefix}
        withDots
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels
        withHorizontalLabels
        chartConfig={{
          backgroundGradientFrom: bgFrom,
          backgroundGradientTo: bgTo,
          decimalPlaces: 1,
          color: () => lineColor,
          labelColor: () => textColor + 'AA',
          propsForDots: { r: '4', strokeWidth: '1', stroke: lineColor },
          propsForBackgroundLines: { stroke: 'transparent' },
          fillShadowGradientOpacity: 0.15,
          fillShadowGradient: lineColor,
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    overflow: 'visible' as const,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  chart: {
    borderRadius: 12,
    alignSelf: 'center',
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
  },
});
