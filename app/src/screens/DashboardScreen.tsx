/**
 * DashboardScreen — Energy consumption overview with visualizations
 */

import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import type { ScanResultData } from './UploadScanScreen';

interface DashboardScreenProps {
  onBack: () => void;
  onScan: () => void;
  scannedDevices: ScanResultData[];
  onClearHistory?: () => void;
}

// Simple bar chart component
function BarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <View style={chartStyles.container}>
      {data.map((item, idx) => (
        <View key={idx} style={chartStyles.barRow}>
          <Text style={chartStyles.barLabel} numberOfLines={1}>{item.label}</Text>
          <View style={chartStyles.barTrack}>
            <View
              style={[
                chartStyles.barFill,
                { width: `${Math.min((item.value / maxValue) * 100, 100)}%`, backgroundColor: item.color }
              ]}
            />
          </View>
          <Text style={chartStyles.barValue}>{item.value.toFixed(0)}W</Text>
        </View>
      ))}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 80, color: '#888', fontSize: 12 },
  barTrack: { flex: 1, height: 24, backgroundColor: '#1f1f2e', borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barValue: { width: 50, color: '#fff', fontSize: 12, textAlign: 'right' },
});

// Category breakdown pie visualization (simplified)
function CategoryBreakdown({ categories }: { categories: { name: string; watts: number; color: string }[] }) {
  const total = categories.reduce((sum, c) => sum + c.watts, 0);
  
  return (
    <View style={catStyles.container}>
      <View style={catStyles.legend}>
        {categories.map((cat, idx) => (
          <View key={idx} style={catStyles.legendItem}>
            <View style={[catStyles.dot, { backgroundColor: cat.color }]} />
            <Text style={catStyles.catName}>{cat.name}</Text>
            <Text style={catStyles.catValue}>{cat.watts.toFixed(0)}W</Text>
            <Text style={catStyles.catPercent}>{total > 0 ? ((cat.watts / total) * 100).toFixed(0) : 0}%</Text>
          </View>
        ))}
      </View>
      {/* Visual bar representation */}
      <View style={catStyles.barContainer}>
        {categories.map((cat, idx) => (
          <View
            key={idx}
            style={[
              catStyles.barSegment,
              { flex: cat.watts, backgroundColor: cat.color }
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const catStyles = StyleSheet.create({
  container: { gap: 16 },
  legend: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  catName: { flex: 1, color: '#ccc', fontSize: 13 },
  catValue: { color: '#fff', fontSize: 13, fontWeight: '600', width: 60, textAlign: 'right' },
  catPercent: { color: '#888', fontSize: 12, width: 40, textAlign: 'right' },
  barContainer: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  barSegment: { height: '100%' },
});

export function DashboardScreen({ onBack, onScan, scannedDevices, onClearHistory }: DashboardScreenProps) {
  const [timeframe, setTimeframe] = useState<'day' | 'month' | 'year'>('month');
  
  // Generate personalized AI tips based on scanned devices
  const aiTips = useMemo(() => {
    const tips = [];
    const devices = scannedDevices.filter(d => d.power_profile?.profile);
    
    // Check for high standby devices
    const highStandby = devices.filter(d => (d.power_profile?.profile?.standby_watts_typical ?? 0) > 3);
    if (highStandby.length > 0) {
      tips.push(`🔌 ${highStandby.length} device${highStandby.length > 1 ? 's have' : ' has'} high standby draw. Use smart power strips to cut phantom loads.`);
    }
    
    // Check for entertainment devices
    const tvs = devices.filter(d => ['Television', 'Monitor'].includes(d.detected_appliance.category));
    if (tvs.length > 0) {
      tips.push('📺 Enable auto-sleep on TVs/monitors to save up to $20/year per device.');
    }
    
    // Check for refrigerators
    const fridges = devices.filter(d => d.detected_appliance.category === 'Refrigerator');
    if (fridges.length > 0) {
      tips.push('🧈 Keep fridge coils clean and set temp to 37°F for optimal efficiency.');
    }
    
    // Check total power
    const totalActive = devices.reduce((sum, d) => sum + (d.power_profile?.profile?.active_watts_typical ?? 0), 0);
    if (totalActive > 500) {
      tips.push('⚡ Your total active power is high. Consider ENERGY STAR replacements for older appliances.');
    }
    
    // General tips if no specific ones
    if (tips.length === 0) {
      tips.push('🌟 Great start! Keep scanning devices to get personalized energy-saving tips.');
    }
    
    return tips;
  }, [scannedDevices]);
  
  // Compute aggregates
  const stats = useMemo(() => {
    const devices = scannedDevices.filter(d => d.power_profile?.profile);
    
    const totalActive = devices.reduce((sum, d) => 
      sum + (d.power_profile?.profile?.active_watts_typical ?? 0), 0);
    const totalStandby = devices.reduce((sum, d) => 
      sum + (d.power_profile?.profile?.standby_watts_typical ?? 0), 0);
    
    // Assume 4h active per device per day
    const dailyKwh = (totalActive * 4 + totalStandby * 20) / 1000;
    const monthlyKwh = dailyKwh * 30;
    const yearlyKwh = monthlyKwh * 12;
    
    const costPerKwh = 0.30;
    const dailyCost = dailyKwh * costPerKwh;
    const monthlyCost = monthlyKwh * costPerKwh;
    const yearlyCost = yearlyKwh * costPerKwh;
    
    // Standby-only cost (24h/day)
    const standbyYearlyCost = (totalStandby * 24 * 365 * costPerKwh) / 1000;
    
    // Environmental impact (kg CO₂ — consistent with backend)
    const CO2_PER_KWH = 0.25; // kg CO₂/kWh
    const TREE_ABSORBS = 21.77; // kg CO₂ per tree per year
    const yearlyCO2 = yearlyKwh * CO2_PER_KWH;
    const treesNeeded = yearlyCO2 / TREE_ABSORBS;
    
    // Achievements calculation
    const achievements = [];
    if (devices.length >= 1) achievements.push({ id: 'first_scan', name: 'First Scan', icon: '🌟', desc: 'Scanned your first device' });
    if (devices.length >= 5) achievements.push({ id: 'power_hunter', name: 'Power Hunter', icon: '🔍', desc: 'Scanned 5 devices' });
    if (devices.length >= 10) achievements.push({ id: 'energy_master', name: 'Energy Master', icon: '👑', desc: 'Scanned 10 devices' });
    if (totalStandby < 10 && devices.length > 0) achievements.push({ id: 'vampire_slayer', name: 'Vampire Slayer', icon: '🧛', desc: 'Low standby power!' });
    if (yearlyKwh > 0 && yearlyKwh < 500) achievements.push({ id: 'eco_warrior', name: 'Eco Warrior', icon: '🌿', desc: 'Under 500 kWh/year' });
    
    return {
      deviceCount: devices.length,
      totalActive,
      totalStandby,
      dailyKwh,
      monthlyKwh,
      yearlyKwh,
      dailyCost,
      monthlyCost,
      yearlyCost,
      standbyYearlyCost,
      yearlyCO2,
      treesNeeded,
      achievements,
    };
  }, [scannedDevices]);

  // Prepare chart data
  const barChartData = useMemo(() => {
    return scannedDevices
      .filter(d => d.power_profile?.profile)
      .map(d => ({
        label: d.detected_appliance.category,
        value: d.power_profile!.profile.active_watts_typical,
        color: getCategoryColor(d.detected_appliance.category),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [scannedDevices]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const catMap: Record<string, number> = {};
    scannedDevices.forEach(d => {
      if (d.power_profile?.profile) {
        const cat = d.detected_appliance.category;
        catMap[cat] = (catMap[cat] || 0) + d.power_profile.profile.active_watts_typical;
      }
    });
    return Object.entries(catMap)
      .map(([name, watts]) => ({ name, watts, color: getCategoryColor(name) }))
      .sort((a, b) => b.watts - a.watts);
  }, [scannedDevices]);

  const maxBarValue = Math.max(...barChartData.map(d => d.value), 100);

  // Timeframe values
  const displayKwh = timeframe === 'day' ? stats.dailyKwh : timeframe === 'month' ? stats.monthlyKwh : stats.yearlyKwh;
  const displayCost = timeframe === 'day' ? stats.dailyCost : timeframe === 'month' ? stats.monthlyCost : stats.yearlyCost;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Energy Dashboard</Text>
        <TouchableOpacity onPress={onScan} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>+ Scan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {stats.deviceCount === 0 ? (
          /* Empty State */
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>No Devices Yet</Text>
            <Text style={styles.emptySubtitle}>
              Scan your appliances to track energy usage
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={onScan}>
              <Text style={styles.emptyButtonText}>Scan First Device</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Timeframe Toggle */}
            <View style={styles.toggleRow}>
              {(['day', 'month', 'year'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.toggleBtn, timeframe === t && styles.toggleBtnActive]}
                  onPress={() => setTimeframe(t)}
                >
                  <Text style={[styles.toggleText, timeframe === t && styles.toggleTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Main Stats */}
            <View style={styles.mainStats}>
              <View style={styles.mainStatCard}>
                <Text style={styles.mainStatValue}>{displayKwh.toFixed(1)}</Text>
                <Text style={styles.mainStatUnit}>kWh</Text>
                <Text style={styles.mainStatLabel}>Energy Usage</Text>
              </View>
              <View style={[styles.mainStatCard, styles.costCard]}>
                <Text style={styles.mainStatValue}>${displayCost.toFixed(2)}</Text>
                <Text style={styles.mainStatUnit}></Text>
                <Text style={styles.mainStatLabel}>Estimated Cost</Text>
              </View>
            </View>

            {/* Summary Row */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{stats.deviceCount}</Text>
                <Text style={styles.summaryLabel}>Devices</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{stats.totalActive.toFixed(0)}W</Text>
                <Text style={styles.summaryLabel}>Active Total</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, styles.standbyText]}>{stats.totalStandby.toFixed(1)}W</Text>
                <Text style={styles.summaryLabel}>Standby Total</Text>
              </View>
            </View>

            {/* Standby Cost Warning */}
            {stats.standbyYearlyCost > 10 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>Phantom Load Alert</Text>
                  <Text style={styles.warningText}>
                    Your devices use ${stats.standbyYearlyCost.toFixed(0)}/year in standby power alone. 
                    That's {stats.totalStandby.toFixed(1)}W running 24/7!
                  </Text>
                </View>
              </View>
            )}

            {/* Achievements Section */}
            {stats.achievements.length > 0 && (
              <View style={styles.achievementsSection}>
                <Text style={styles.sectionTitle}>🏆 Achievements</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.achievementsScroll}>
                  <View style={styles.achievementsRow}>
                    {stats.achievements.map((ach) => (
                      <View key={ach.id} style={styles.achievementCard}>
                        <Text style={styles.achievementIcon}>{ach.icon}</Text>
                        <Text style={styles.achievementName}>{ach.name}</Text>
                        <Text style={styles.achievementDesc}>{ach.desc}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Environmental Impact */}
            {stats.yearlyCO2 > 0 && (
              <View style={styles.envSection}>
                <Text style={styles.sectionTitle}>🌍 Environmental Impact</Text>
                <View style={styles.envCard}>
                  <View style={styles.envRow}>
                    <View style={styles.envStat}>
                      <Text style={styles.envIcon}>💨</Text>
                      <Text style={styles.envValue}>{stats.yearlyCO2.toFixed(0)}</Text>
                      <Text style={styles.envLabel}>kg CO₂/year</Text>
                    </View>
                    <View style={styles.envDivider} />
                    <View style={styles.envStat}>
                      <Text style={styles.envIcon}>🌳</Text>
                      <Text style={styles.envValue}>{stats.treesNeeded.toFixed(1)}</Text>
                      <Text style={styles.envLabel}>trees to offset</Text>
                    </View>
                  </View>
                  <View style={styles.envCompare}>
                    <Text style={styles.envCompareText}>
                      ≈ {(stats.yearlyCO2 / 19.6).toFixed(0)} gallons of gasoline burned
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Power by Device Chart */}
            {barChartData.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Power by Device</Text>
                <View style={styles.chartCard}>
                  <BarChart data={barChartData} maxValue={maxBarValue} />
                </View>
              </View>
            )}

            {/* Category Breakdown */}
            {categoryData.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Category Breakdown</Text>
                <View style={styles.chartCard}>
                  <CategoryBreakdown categories={categoryData} />
                </View>
              </View>
            )}

            {/* Device List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Devices</Text>
              {scannedDevices.map((device, index) => {
                const a = device.detected_appliance;
                const p = device.power_profile?.profile;
                if (!p) return null;
                
                const deviceMonthly = ((p.active_watts_typical * 4 + p.standby_watts_typical * 20) * 30 * 0.30) / 1000;
                
                return (
                  <View key={index} style={styles.deviceCard}>
                    <View style={styles.deviceRow}>
                      <View style={[styles.deviceIcon, { backgroundColor: getCategoryColor(a.category) + '20' }]}>
                        <Text style={styles.deviceIconText}>{getCategoryIcon(a.category)}</Text>
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{a.category}</Text>
                        <Text style={styles.deviceBrand}>
                          {a.brand !== 'Unknown' ? a.brand : 'Generic'}
                          {a.model !== 'Unknown' && ` ${a.model}`}
                        </Text>
                      </View>
                      <View style={styles.devicePower}>
                        <Text style={styles.deviceWatts}>{p.active_watts_typical}W</Text>
                        <Text style={styles.deviceCost}>${deviceMonthly.toFixed(2)}/mo</Text>
                      </View>
                    </View>
                    <View style={styles.deviceMeta}>
                      <Text style={styles.metaItem}>Standby: {p.standby_watts_typical}W</Text>
                      <Text style={styles.metaItem}>Source: {p.source === 'category_default' ? 'Berkeley Lab' : p.source}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Tips - AI Personalized */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>🤖 AI Energy Tips</Text>
              <View style={styles.tipsList}>
                {aiTips.map((tip, idx) => (
                  <Text key={idx} style={styles.tipItem}>{tip}</Text>
                ))}
              </View>
            </View>

            {/* Clear History Button */}
            {onClearHistory && scannedDevices.length > 0 && (
              <TouchableOpacity style={styles.clearHistoryBtn} onPress={onClearHistory}>
                <Text style={styles.clearHistoryText}>🗑️ Clear Scan History</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'Television': '📺',
    'Refrigerator': '🧊',
    'Microwave': '📻',
    'Laptop': '💻',
    'Oven': '🔥',
    'Toaster': '🍞',
    'Hair Dryer': '💨',
    'Washing Machine': '🧺',
    'Dryer': '🌀',
    'Air Conditioner': '❄️',
    'Space Heater': '🔥',
    'Monitor': '🖥️',
    'Light Bulb': '💡',
  };
  return icons[category] || '🔌';
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'Television': '#2196F3',
    'Refrigerator': '#00BCD4',
    'Microwave': '#FF9800',
    'Laptop': '#9C27B0',
    'Oven': '#F44336',
    'Toaster': '#FF5722',
    'Hair Dryer': '#E91E63',
    'Washing Machine': '#3F51B5',
    'Dryer': '#673AB7',
    'Air Conditioner': '#00ACC1',
    'Space Heater': '#FF5722',
    'Monitor': '#7C4DFF',
    'Light Bulb': '#FFC107',
  };
  return colors[category] || '#4CAF50';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#12121a',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f2e',
  },
  headerBtn: { padding: 8 },
  headerBtnText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#12121a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#666', fontSize: 14, marginBottom: 24, textAlign: 'center' },
  emptyButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#4CAF50' },
  toggleText: { color: '#666', fontSize: 14, fontWeight: '600' },
  toggleTextActive: { color: '#fff' },

  // Main stats
  mainStats: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mainStatCard: {
    flex: 1,
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  costCard: { borderColor: '#4CAF50' },
  mainStatValue: { color: '#fff', fontSize: 36, fontWeight: '800' },
  mainStatUnit: { color: '#888', fontSize: 14, marginTop: -4 },
  mainStatLabel: { color: '#666', fontSize: 12, marginTop: 8 },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  summaryLabel: { color: '#888', fontSize: 11, marginTop: 4 },
  standbyText: { color: '#FF9800' },

  // Warning
  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
    gap: 12,
  },
  warningIcon: { fontSize: 24 },
  warningContent: { flex: 1 },
  warningTitle: { color: '#FF9800', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  warningText: { color: '#ccc', fontSize: 13, lineHeight: 18 },

  // Sections
  section: { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  chartCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },

  // Device cards
  deviceCard: {
    backgroundColor: '#12121a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceIconText: { fontSize: 22 },
  deviceInfo: { flex: 1 },
  deviceName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deviceBrand: { color: '#888', fontSize: 12, marginTop: 2 },
  devicePower: { alignItems: 'flex-end' },
  deviceWatts: { color: '#4CAF50', fontSize: 18, fontWeight: '700' },
  deviceCost: { color: '#888', fontSize: 12 },
  deviceMeta: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f1f2e',
    gap: 16,
  },
  metaItem: { color: '#666', fontSize: 11 },

  // Tips
  tipsCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f1f2e',
    marginBottom: 20,
  },
  tipsTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  tipsList: { gap: 8 },
  tipItem: { color: '#888', fontSize: 13, lineHeight: 18 },

  // Achievements
  achievementsSection: { marginBottom: 20 },
  achievementsScroll: { marginHorizontal: -16 },
  achievementsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12 },
  achievementCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    width: 120,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  achievementIcon: { fontSize: 32, marginBottom: 8 },
  achievementName: { color: '#FFD700', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  achievementDesc: { color: '#888', fontSize: 10, textAlign: 'center', marginTop: 4 },

  // Environmental Impact
  envSection: { marginBottom: 20 },
  envCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  envRow: { flexDirection: 'row', alignItems: 'center' },
  envStat: { flex: 1, alignItems: 'center' },
  envIcon: { fontSize: 28, marginBottom: 8 },
  envValue: { color: '#4CAF50', fontSize: 28, fontWeight: '800' },
  envLabel: { color: '#888', fontSize: 11, marginTop: 4 },
  envDivider: { width: 1, height: 60, backgroundColor: '#2a2a3e' },
  envCompare: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f1f2e',
    alignItems: 'center',
  },
  envCompareText: { color: '#888', fontSize: 12 },

  // Clear History
  clearHistoryBtn: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  clearHistoryText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
});
