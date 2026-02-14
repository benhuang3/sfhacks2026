/**
 * DashboardScreen — SaaS-style overview of scanned appliances & power usage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { ScanResultData } from './UploadScanScreen';

interface DashboardScreenProps {
  onBack: () => void;
  onScan: () => void;
  scannedDevices: ScanResultData[];
}

export function DashboardScreen({ onBack, onScan, scannedDevices }: DashboardScreenProps) {
  // Compute aggregates
  const totalDevices = scannedDevices.length;
  const totalActiveWatts = scannedDevices.reduce((sum, d) => {
    const watts = d.power_profile?.profile?.active_watts_typical ?? 0;
    return sum + watts;
  }, 0);
  const totalStandbyWatts = scannedDevices.reduce((sum, d) => {
    const watts = d.power_profile?.profile?.standby_watts_typical ?? 0;
    return sum + watts;
  }, 0);
  // Estimate monthly cost: active 8h/day + standby 16h/day @ $0.12/kWh
  const monthlyKwh =
    (totalActiveWatts * 8 * 30 + totalStandbyWatts * 16 * 30) / 1000;
  const monthlyCost = monthlyKwh * 0.12;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity onPress={onScan}>
          <Text style={styles.headerAction}>+ Scan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.cardGreen]}>
            <Text style={styles.summaryValue}>{totalDevices}</Text>
            <Text style={styles.summaryLabel}>Devices Scanned</Text>
          </View>
          <View style={[styles.summaryCard, styles.cardBlue]}>
            <Text style={styles.summaryValue}>{totalActiveWatts.toFixed(0)}W</Text>
            <Text style={styles.summaryLabel}>Total Active Power</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.cardOrange]}>
            <Text style={styles.summaryValue}>{totalStandbyWatts.toFixed(1)}W</Text>
            <Text style={styles.summaryLabel}>Total Standby Draw</Text>
          </View>
          <View style={[styles.summaryCard, styles.cardPurple]}>
            <Text style={styles.summaryValue}>${monthlyCost.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Est. Monthly Cost</Text>
          </View>
        </View>

        {/* Energy Insight */}
        {totalDevices > 0 && (
          <View style={styles.insightCard}>
            <Text style={styles.insightIcon}>💡</Text>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Energy Insight</Text>
              <Text style={styles.insightText}>
                Your {totalDevices} device{totalDevices > 1 ? 's' : ''} consume{' '}
                {monthlyKwh.toFixed(1)} kWh/month. Standby power alone costs you{' '}
                ${((totalStandbyWatts * 24 * 30 * 0.12) / 1000).toFixed(2)}/month — consider
                using smart power strips to cut phantom loads.
              </Text>
            </View>
          </View>
        )}

        {/* Device List */}
        <Text style={styles.sectionTitle}>Scanned Devices</Text>

        {totalDevices === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔌</Text>
            <Text style={styles.emptyTitle}>No devices scanned yet</Text>
            <Text style={styles.emptySubtitle}>
              Upload a photo of your appliance to get started
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={onScan}>
              <Text style={styles.emptyButtonText}>Scan Your First Device</Text>
            </TouchableOpacity>
          </View>
        ) : (
          scannedDevices.map((device, index) => {
            const a = device.detected_appliance;
            const p = device.power_profile?.profile;
            return (
              <View key={index} style={styles.deviceCard}>
                <View style={styles.deviceHeader}>
                  <View style={styles.deviceIcon}>
                    <Text style={styles.deviceIconText}>
                      {a.category === 'Television' ? '📺' :
                       a.category === 'Refrigerator' ? '🧊' :
                       a.category === 'Microwave' ? '🍳' :
                       a.category === 'Laptop' ? '💻' :
                       a.category === 'Oven' ? '🔥' :
                       a.category === 'Toaster' ? '🍞' :
                       a.category === 'Hair Dryer' ? '💨' : '🔌'}
                    </Text>
                  </View>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{a.name}</Text>
                    <Text style={styles.deviceMeta}>
                      {a.brand !== 'Unknown' ? `${a.brand} · ` : ''}
                      {Math.round(a.confidence * 100)}% confidence
                    </Text>
                  </View>
                  {p && (
                    <View style={styles.devicePower}>
                      <Text style={styles.deviceWatts}>{p.active_watts_typical}W</Text>
                      <Text style={styles.devicePowerLabel}>Active</Text>
                    </View>
                  )}
                </View>

                {p && (
                  <View style={styles.deviceStats}>
                    <View style={styles.deviceStat}>
                      <Text style={styles.deviceStatValue}>{p.standby_watts_typical}W</Text>
                      <Text style={styles.deviceStatLabel}>Standby</Text>
                    </View>
                    <View style={styles.deviceStat}>
                      <Text style={styles.deviceStatValue}>
                        ${((p.active_watts_typical * 8 * 30 * 0.12) / 1000).toFixed(2)}
                      </Text>
                      <Text style={styles.deviceStatLabel}>Monthly</Text>
                    </View>
                    <View style={styles.deviceStat}>
                      <Text style={styles.deviceStatValue}>{p.category}</Text>
                      <Text style={styles.deviceStatLabel}>Category</Text>
                    </View>
                    <View style={styles.deviceStat}>
                      <Text style={styles.deviceStatValue}>{p.source}</Text>
                      <Text style={styles.deviceStatLabel}>Source</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#1a1a2e',
    borderBottomWidth: 1, borderBottomColor: '#2a2a3e',
  },
  headerBack: { color: '#4CAF50', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerAction: { color: '#4CAF50', fontSize: 16, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, maxWidth: 700, alignSelf: 'center', width: '100%' },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: {
    flex: 1, borderRadius: 12, padding: 20, alignItems: 'center',
  },
  cardGreen: { backgroundColor: 'rgba(76, 175, 80, 0.15)', borderWidth: 1, borderColor: '#4CAF50' },
  cardBlue: { backgroundColor: 'rgba(33, 150, 243, 0.15)', borderWidth: 1, borderColor: '#2196F3' },
  cardOrange: { backgroundColor: 'rgba(255, 152, 0, 0.15)', borderWidth: 1, borderColor: '#FF9800' },
  cardPurple: { backgroundColor: 'rgba(156, 39, 176, 0.15)', borderWidth: 1, borderColor: '#9C27B0' },
  summaryValue: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  summaryLabel: { color: '#aaa', fontSize: 12, fontWeight: '600' },

  // Insight
  insightCard: {
    flexDirection: 'row', backgroundColor: '#1a2e1a', borderRadius: 12,
    padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#4CAF50',
  },
  insightIcon: { fontSize: 24, marginRight: 12 },
  insightContent: { flex: 1 },
  insightTitle: { color: '#4CAF50', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  insightText: { color: '#ccc', fontSize: 13, lineHeight: 20 },

  // Section
  sectionTitle: {
    color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, marginTop: 8,
  },

  // Empty
  emptyState: {
    alignItems: 'center', paddingVertical: 48, backgroundColor: '#1a1a2e',
    borderRadius: 16, borderWidth: 1, borderColor: '#2a2a3e',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#888', fontSize: 14, marginBottom: 24, textAlign: 'center', paddingHorizontal: 32 },
  emptyButton: {
    backgroundColor: '#4CAF50', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  emptyButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Device Cards
  deviceCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2a2a3e',
  },
  deviceHeader: { flexDirection: 'row', alignItems: 'center' },
  deviceIcon: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: '#2a2a3e',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  deviceIconText: { fontSize: 22 },
  deviceInfo: { flex: 1 },
  deviceName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deviceMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  devicePower: { alignItems: 'flex-end' },
  deviceWatts: { color: '#4CAF50', fontSize: 20, fontWeight: '800' },
  devicePowerLabel: { color: '#888', fontSize: 11 },

  deviceStats: {
    flexDirection: 'row', marginTop: 12, gap: 8,
  },
  deviceStat: {
    flex: 1, backgroundColor: '#2a2a3e', borderRadius: 8, padding: 8, alignItems: 'center',
  },
  deviceStatValue: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  deviceStatLabel: { color: '#888', fontSize: 10 },
});
