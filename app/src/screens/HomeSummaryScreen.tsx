/**
 * HomeSummaryScreen — Aggregated energy, cost, CO₂ view with assumptions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../utils/alert';
import {
  getHomeSummary,
  getAssumptions,
  setAssumptions,
  type HomeSummary,
  type Assumptions,
  type DeviceBreakdown,
} from '../services/apiClient';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { useTheme } from '../../App';

interface HomeSummaryScreenProps {
  homeId: string;
  onBack: () => void;
  onViewActions: (homeId: string) => void;
}

function getCategoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    TV: '📺', Television: '📺', Refrigerator: '🧊', Microwave: '📻',
    Laptop: '💻', Oven: '🔥', Toaster: '🍞', 'Hair Dryer': '💨',
    'Washing Machine': '🧺', Dryer: '🌀', 'Air Conditioner': '❄️',
    'Space Heater': '🔥', Monitor: '🖥️', 'Light Bulb': '💡', Light: '💡',
  };
  return icons[cat] || '🔌';
}

function getCategoryColor(cat: string): string {
  const colors: Record<string, string> = {
    Television: '#2196F3', TV: '#2196F3', Refrigerator: '#00BCD4',
    Microwave: '#FF9800', Laptop: '#9C27B0', Oven: '#F44336',
    Toaster: '#FF5722', 'Hair Dryer': '#E91E63', 'Washing Machine': '#3F51B5',
    Dryer: '#673AB7', 'Air Conditioner': '#00ACC1', 'Space Heater': '#FF5722',
    Monitor: '#7C4DFF', 'Light Bulb': '#FFC107', Light: '#FFC107',
  };
  return colors[cat] || '#4CAF50';
}

export function HomeSummaryScreen({ homeId, onBack, onViewActions }: HomeSummaryScreenProps) {
  const { colors, isDark } = useTheme();
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [rateInput, setRateInput] = useState('0.30');
  const [co2Input, setCo2Input] = useState('0.25');
  const [profileInput, setProfileInput] = useState('typical');
  const [saving, setSaving] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getHomeSummary(homeId);
      setSummary(data);
      // Set form defaults from assumptions
      setRateInput(String(data.assumptions.rate_per_kwh));
      setCo2Input(String(data.assumptions.kg_co2_per_kwh));
      setProfileInput(data.assumptions.profile);
    } catch (err) {
      console.warn('Failed to load summary:', err);
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleSaveAssumptions = async () => {
    try {
      setSaving(true);
      await setAssumptions(homeId, {
        rate_per_kwh: parseFloat(rateInput) || 0.30,
        kg_co2_per_kwh: parseFloat(co2Input) || 0.25,
        profile: profileInput as any,
      });
      setShowSettings(false);
      await loadSummary();
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onBack}><Text style={[styles.headerBtnText, { color: colors.accent }]}>← Back</Text></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Home Summary</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Computing summary...</Text>
        </View>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onBack}><Text style={[styles.headerBtnText, { color: colors.accent }]}>← Back</Text></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Home Summary</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Data</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Add devices to see energy summary.</Text>
        </View>
      </View>
    );
  }

  const { totals, by_device, action_savings } = summary;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Energy Summary</Text>
        <TouchableOpacity onPress={() => setShowSettings(!showSettings)} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Settings Panel */}
        {showSettings && (
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
            <Text style={[styles.settingsTitle, { color: colors.accent }]}>⚙️ Assumptions</Text>
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>Rate ($/kWh)</Text>
              <TextInput
                style={[styles.settingInput, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]}
                value={rateInput}
                onChangeText={setRateInput}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>CO₂ (kg/kWh)</Text>
              <TextInput
                style={[styles.settingInput, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]}
                value={co2Input}
                onChangeText={setCo2Input}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>Profile</Text>
              <View style={styles.profileToggle}>
                {(['light', 'typical', 'heavy'] as const).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.profileBtn, { backgroundColor: isDark ? '#1a1a2e' : '#e8e8e8', borderColor: colors.border }, profileInput === p && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    onPress={() => setProfileInput(p)}
                  >
                    <Text style={[styles.profileBtnText, { color: colors.textSecondary }, profileInput === p && styles.profileBtnTextActive]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.disabledBtn]}
              onPress={handleSaveAssumptions}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save & Recalculate</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Main Stats */}
        <View style={styles.mainStats}>
          <View style={[styles.mainStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.mainStatIcon}>⚡</Text>
            <Text style={[styles.mainStatValue, { color: colors.text }]}>{totals.annual_kwh.toFixed(0)}</Text>
            <Text style={[styles.mainStatUnit, { color: colors.textSecondary }]}>kWh/year</Text>
            <Text style={[styles.mainStatRange, { color: colors.textSecondary }]}>
              {totals.annual_kwh_min.toFixed(0)} – {totals.annual_kwh_max.toFixed(0)}
            </Text>
          </View>
          <View style={[styles.mainStatCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
            <Text style={styles.mainStatIcon}>💰</Text>
            <Text style={[styles.mainStatValue, { color: colors.text }]}>${totals.annual_cost.toFixed(0)}</Text>
            <Text style={[styles.mainStatUnit, { color: colors.textSecondary }]}>/year</Text>
            <Text style={[styles.mainStatRange, { color: colors.textSecondary }]}>
              ${totals.annual_cost_min.toFixed(0)} – ${totals.annual_cost_max.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={[styles.quickStats, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.quickStat}>
            <Text style={[styles.qsValue, { color: colors.text }]}>{totals.device_count}</Text>
            <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Devices</Text>
          </View>
          <View style={[styles.qsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.quickStat}>
            <Text style={[styles.qsValue, { color: colors.text }]}>${totals.monthly_cost.toFixed(2)}</Text>
            <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Monthly</Text>
          </View>
          <View style={[styles.qsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.quickStat}>
            <Text style={[styles.qsValue, { color: '#FF9800' }]}>
              ${totals.standby_annual_cost.toFixed(0)}
            </Text>
            <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Standby/yr</Text>
          </View>
          <View style={[styles.qsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.quickStat}>
            <Text style={[styles.qsValue, { color: '#2196F3' }]}>
              {totals.annual_co2_kg.toFixed(0)}kg
            </Text>
            <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>CO₂/yr</Text>
          </View>
        </View>

        {/* Savings from actions */}
        {action_savings && action_savings.executed_actions > 0 && (
          <View style={styles.savingsCard}>
            <Text style={[styles.savingsTitle, { color: colors.accent }]}>✅ Savings from Actions</Text>
            <View style={styles.savingsRow}>
              <View style={styles.savingsStat}>
                <Text style={[styles.savingsValue, { color: colors.accent }]}>
                  ${action_savings.total_annual_dollars_saved.toFixed(0)}
                </Text>
                <Text style={[styles.savingsLabel, { color: colors.textSecondary }]}>$/year saved</Text>
              </View>
              <View style={styles.savingsStat}>
                <Text style={[styles.savingsValue, { color: colors.accent }]}>
                  {action_savings.total_annual_kwh_saved.toFixed(0)}
                </Text>
                <Text style={[styles.savingsLabel, { color: colors.textSecondary }]}>kWh saved</Text>
              </View>
              <View style={styles.savingsStat}>
                <Text style={[styles.savingsValue, { color: colors.accent }]}>
                  {action_savings.total_annual_co2_kg_saved.toFixed(1)}
                </Text>
                <Text style={[styles.savingsLabel, { color: colors.textSecondary }]}>kg CO₂</Text>
              </View>
            </View>
          </View>
        )}

        {/* Device Breakdown */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Breakdown</Text>
          {by_device
            .sort((a, b) => b.annual_cost - a.annual_cost)
            .map((d, idx) => (
            <View key={d.deviceId || idx} style={[styles.deviceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.deviceRow}>
                <View style={[styles.deviceIconBox, { backgroundColor: getCategoryColor(d.category) + '20' }]}>
                  <Appliance3DModel category={d.category} size={28} showLabel={false} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceLabel, { color: colors.text }]}>{d.label}</Text>
                  <Text style={[styles.deviceCategory, { color: colors.textSecondary }]}>{d.category}</Text>
                </View>
                <View style={styles.deviceCost}>
                  <Text style={[styles.deviceCostValue, { color: colors.accent }]}>${d.annual_cost.toFixed(0)}/yr</Text>
                  <Text style={[styles.deviceKwh, { color: colors.textSecondary }]}>{d.annual_kwh.toFixed(0)} kWh</Text>
                </View>
              </View>
              <View style={[styles.deviceDetails, { borderTopColor: colors.border }]}>
                <Text style={[styles.detailItem, { color: colors.textSecondary }]}>
                  CO₂: {d.annual_co2_kg.toFixed(1)} kg
                </Text>
                <Text style={[styles.detailItem, { color: colors.textSecondary }]}>
                  Standby: ${d.standby_annual_cost.toFixed(2)}/yr
                </Text>
                <Text style={[styles.detailItem, { color: colors.textSecondary }]}>
                  Range: {d.annual_kwh_min.toFixed(0)}–{d.annual_kwh_max.toFixed(0)} kWh
                </Text>
              </View>
              {/* Cost bar */}
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.min((d.annual_cost / Math.max(totals.annual_cost, 1)) * 100, 100)}%`,
                      backgroundColor: getCategoryColor(d.category),
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Optimize CTA */}
        <TouchableOpacity
          style={styles.optimizeBtn}
          onPress={() => onViewActions(homeId)}
        >
          <Text style={styles.optimizeBtnText}>🤖 Get AI Optimization Proposals</Text>
        </TouchableOpacity>

        {/* Assumptions footer */}
        <View style={styles.assumptionsFooter}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Rate: ${summary.assumptions.rate_per_kwh}/kWh · CO₂: {summary.assumptions.kg_co2_per_kwh} kg/kWh · Profile: {summary.assumptions.profile}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#12121a',
    borderBottomWidth: 1, borderBottomColor: '#1f1f2e',
  },
  headerBtn: { padding: 8 },
  headerBtnText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#666', fontSize: 14, textAlign: 'center' },

  // Settings
  settingsCard: {
    backgroundColor: '#12121a', borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#4CAF50',
  },
  settingsTitle: { color: '#4CAF50', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  settingLabel: { color: '#ccc', fontSize: 14, flex: 1 },
  settingInput: {
    backgroundColor: '#1a1a2e', borderRadius: 8, padding: 10, color: '#fff',
    fontSize: 14, width: 100, textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3e',
  },
  profileToggle: { flexDirection: 'row', gap: 6 },
  profileBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#2a2a3e',
  },
  profileBtnActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  profileBtnText: { color: '#888', fontSize: 12, fontWeight: '600' },
  profileBtnTextActive: { color: '#fff' },
  saveBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabledBtn: { opacity: 0.5 },

  // Main stats
  mainStats: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mainStatCard: {
    flex: 1, backgroundColor: '#12121a', borderRadius: 16, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: '#1f1f2e',
  },
  costCard: { borderColor: '#4CAF50' },
  mainStatIcon: { fontSize: 24, marginBottom: 8 },
  mainStatValue: { color: '#fff', fontSize: 32, fontWeight: '800' },
  mainStatUnit: { color: '#888', fontSize: 13, marginTop: -2 },
  mainStatRange: { color: '#555', fontSize: 11, marginTop: 6 },

  // Quick stats
  quickStats: {
    flexDirection: 'row', backgroundColor: '#12121a', borderRadius: 12,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1f1f2e',
  },
  quickStat: { flex: 1, alignItems: 'center' },
  qsValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  qsLabel: { color: '#888', fontSize: 10, marginTop: 4 },
  qsDivider: { width: 1, backgroundColor: '#2a2a3e', marginVertical: 4 },

  // Savings
  savingsCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)', borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  savingsTitle: { color: '#4CAF50', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  savingsRow: { flexDirection: 'row' },
  savingsStat: { flex: 1, alignItems: 'center' },
  savingsValue: { color: '#4CAF50', fontSize: 22, fontWeight: '800' },
  savingsLabel: { color: '#888', fontSize: 11, marginTop: 4 },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },

  // Device cards
  deviceCard: {
    backgroundColor: '#12121a', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#1f1f2e',
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIconBox: {
    width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  deviceIconText: { fontSize: 20 },
  deviceInfo: { flex: 1 },
  deviceLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  deviceCategory: { color: '#888', fontSize: 11, marginTop: 2 },
  deviceCost: { alignItems: 'flex-end' },
  deviceCostValue: { color: '#4CAF50', fontSize: 16, fontWeight: '700' },
  deviceKwh: { color: '#888', fontSize: 11, marginTop: 2 },

  deviceDetails: {
    flexDirection: 'row', marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#1f1f2e', gap: 12,
  },
  detailItem: { color: '#666', fontSize: 11 },

  barTrack: {
    height: 6, backgroundColor: '#1f1f2e', borderRadius: 3, marginTop: 10, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },

  // Optimize
  optimizeBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 18, borderRadius: 14,
    alignItems: 'center', marginBottom: 20,
  },
  optimizeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Footer
  assumptionsFooter: { alignItems: 'center', paddingBottom: 40 },
  footerText: { color: '#555', fontSize: 11, textAlign: 'center' },
});
