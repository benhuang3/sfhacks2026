/**
 * ChartDashboardScreen — SaaS-style dashboard with donut + line charts
 *
 * Uses react-native-chart-kit for line chart and a custom SVG donut.
 * Pulls data from backend /homes/{id}/summary when a home exists,
 * or falls back to scannedDevices prop for local data.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView,
  Dimensions, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../App';
import { useAuth } from '../context/AuthContext';
import { Appliance3DModel } from '../components/Appliance3DModel';
import {
  listHomes, getHomeSummary, HomeSummary, DeviceBreakdown, Home,
} from '../services/apiClient';
import { ScanResultData } from './UploadScanScreen';
import { RATE_PER_KWH, CO2_PER_KWH, DEFAULT_USAGE_HOURS } from '../utils/energyConstants';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  scannedDevices?: ScanResultData[];
  onBack?: () => void;
  onScan?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SCREEN_W = Dimensions.get('window').width;

const CATEGORY_COLORS: Record<string, string> = {
  'Television': '#FF6384', 'TV': '#FF6384',
  'Refrigerator': '#36A2EB', 'Washing Machine': '#FFCE56',
  'Dryer': '#FF9F40', 'Microwave': '#9966FF',
  'Laptop': '#4BC0C0', 'Monitor': '#C9CBCF',
  'Space Heater': '#FF4444', 'Air Conditioner': '#00BFFF',
  'Light Bulb': '#FFD700', 'Toaster': '#8B4513',
  'Oven': '#DC143C', 'Hair Dryer': '#FF69B4',
  'Phone Charger': '#7CFC00', 'Unknown Device': '#888888',
};

// ---------------------------------------------------------------------------
// Donut Chart (SVG)
// ---------------------------------------------------------------------------
interface DonutSlice { label: string; value: number; color: string; }

function DonutChart({ slices, size = 180, strokeWidth = 28, textColor = '#fff', subColor = '#888' }: { slices: DonutSlice[]; size?: number; strokeWidth?: number; textColor?: string; subColor?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: subColor, fontSize: 14 }}>No data</Text>
      </View>
    );
  }

  let accumulated = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation="-90" origin={`${cx},${cy}`}>
        {slices.map((slice, i) => {
          const pct = slice.value / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const offset = accumulated * circumference;
          accumulated += pct;
          return (
            <Circle
              key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
        })}
      </G>
      <SvgText
        x={cx} y={cy - 8}
        textAnchor="middle"
        fill={textColor}
        fontSize="20"
        fontWeight="bold"
      >
        ${total.toFixed(0)}
      </SvgText>
      <SvgText
        x={cx} y={cy + 14}
        textAnchor="middle"
        fill={subColor}
        fontSize="11"
      >
        /year
      </SvgText>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function ChartDashboardScreen({ scannedDevices = [], onBack, onScan }: Props) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'month' | 'year'>('year');

  // Load home + summary from backend
  const loadData = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const homes = await listHomes(user.id);
      if (homes.length > 0) {
        setHome(homes[0]);
        const s = await getHomeSummary(homes[0].id);
        setSummary(s);
      }
    } catch (e) {
      console.log('Dashboard load error:', e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Refetch when screen gains focus (e.g., after adding device)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Compute stats from summary OR scannedDevices fallback
  const stats = useMemo(() => {
    if (summary) {
      const t = summary.totals;
      const savings = summary.action_savings;
      return {
        annualKwh: t.annual_kwh,
        annualCost: t.annual_cost,
        annualCo2: t.annual_co2_kg,
        monthlyCost: t.monthly_cost,
        dailyCost: t.daily_cost,
        ghostCost: t.standby_annual_cost,
        ghostKwh: t.standby_annual_kwh,
        deviceCount: t.device_count,
        savedDollars: savings?.total_annual_dollars_saved ?? 0,
        savedKwh: savings?.total_annual_kwh_saved ?? 0,
        breakdown: summary.by_device,
      };
    }

    // Fallback to local scannedDevices
    let totalActive = 0, totalStandby = 0;
    scannedDevices.forEach(d => {
      totalActive += d.power_profile?.profile?.active_watts_typical ?? 0;
      totalStandby += d.power_profile?.profile?.standby_watts_typical ?? 0;
    });
    const activeKwh = totalActive * DEFAULT_USAGE_HOURS * 365 / 1000;
    const standbyKwh = totalStandby * (24 - DEFAULT_USAGE_HOURS) * 365 / 1000;
    const totalKwh = activeKwh + standbyKwh;
    return {
      annualKwh: totalKwh,
      annualCost: totalKwh * RATE_PER_KWH,
      annualCo2: totalKwh * CO2_PER_KWH,
      monthlyCost: totalKwh * RATE_PER_KWH / 12,
      dailyCost: totalKwh * RATE_PER_KWH / 365,
      ghostCost: standbyKwh * RATE_PER_KWH,
      ghostKwh: standbyKwh,
      deviceCount: scannedDevices.length,
      savedDollars: 0,
      savedKwh: 0,
      breakdown: [] as DeviceBreakdown[],
    };
  }, [summary, scannedDevices]);

  // Donut data: by device category
  const donutSlices = useMemo((): DonutSlice[] => {
    if (stats.breakdown.length > 0) {
      const catMap: Record<string, number> = {};
      stats.breakdown.forEach(b => {
        catMap[b.category] = (catMap[b.category] ?? 0) + b.annual_cost;
      });
      return Object.entries(catMap).map(([label, value]) => ({
        label, value: Math.round(value * 100) / 100,
        color: CATEGORY_COLORS[label] ?? '#888',
      })).sort((a, b) => b.value - a.value);
    }
    // Fallback
    const catMap: Record<string, number> = {};
    scannedDevices.forEach(d => {
      const cat = d.power_profile?.profile?.category ?? 'Unknown';
      const w = d.power_profile?.profile?.active_watts_typical ?? 0;
      const kwh = w * DEFAULT_USAGE_HOURS * 365 / 1000;
      catMap[cat] = (catMap[cat] ?? 0) + kwh * RATE_PER_KWH;
    });
    return Object.entries(catMap).map(([label, value]) => ({
      label, value: Math.round(value * 100) / 100,
      color: CATEGORY_COLORS[label] ?? '#888',
    })).sort((a, b) => b.value - a.value);
  }, [stats.breakdown, scannedDevices]);

  // Simulated 7-day trend line
  const lineData = useMemo(() => {
    const baseDaily = stats.dailyCost;
    return {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: Array.from({ length: 7 }, (_, i) => {
          const variance = (Math.sin(i * 1.5) * 0.15 + (Math.random() - 0.5) * 0.1);
          return Math.max(0.01, baseDaily * (1 + variance));
        }),
        strokeWidth: 3,
      }],
    };
  }, [stats.dailyCost]);

  const costDisplay = (val: number) => {
    if (timeframe === 'day') return (val / 365).toFixed(2);
    if (timeframe === 'month') return (val / 12).toFixed(2);
    return val.toFixed(2);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>📊 Energy Dashboard</Text>
        {home && <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{home.name}</Text>}
      </View>

      {/* Timeframe Toggle */}
      <View style={styles.toggleRow}>
        {(['day', 'month', 'year'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.toggleBtn, { backgroundColor: timeframe === t ? colors.accent : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
            onPress={() => setTimeframe(t)}
          >
            <Text style={[styles.toggleText, { color: timeframe === t ? '#fff' : colors.textSecondary }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>${costDisplay(stats.annualCost)}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Energy Cost</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: '#FF9800' }]}>${costDisplay(stats.ghostCost)}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Ghost Energy</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: '#36A2EB' }]}>{stats.annualKwh.toFixed(0)}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>kWh/year</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: '#9966FF' }]}>{stats.annualCo2.toFixed(0)} kg</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CO₂/year</Text>
        </View>
      </View>

      {stats.savedDollars > 0 && (
        <View style={[styles.savingsCard, { backgroundColor: isDark ? '#1a2e1a' : '#e8f5e9', borderColor: colors.accent }]}>
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>
            💰 You're saving ${stats.savedDollars.toFixed(2)}/year from {stats.savedKwh.toFixed(0)} kWh!
          </Text>
        </View>
      )}

      {/* Donut Chart */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>Cost Breakdown by Category</Text>
        <View style={styles.donutRow}>
          <DonutChart slices={donutSlices} textColor={colors.text} subColor={colors.textSecondary} />
          <View style={styles.legendCol}>
            {donutSlices.slice(0, 6).map((s, i) => (
              <View key={i} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {s.label}: ${s.value.toFixed(0)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Line Chart */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>7-Day Energy Trend (est.)</Text>
        {stats.dailyCost > 0 ? (
          <LineChart
            data={lineData}
            width={SCREEN_W - 80}
            height={180}
            yAxisLabel="$"
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: isDark ? '#12121a' : '#ffffff',
              backgroundGradientTo: isDark ? '#12121a' : '#ffffff',
              decimalPlaces: 2,
              color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
              labelColor: () => isDark ? '#888' : '#555',
              propsForDots: { r: '4', strokeWidth: '2', stroke: '#4CAF50' },
            }}
            bezier
            style={{ borderRadius: 12 }}
          />
        ) : (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 40 }}>
            Scan devices to see energy trends
          </Text>
        )}
      </View>

      {/* Device list */}
      {stats.breakdown.length > 0 && (
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>Devices ({stats.deviceCount})</Text>
          {stats.breakdown.sort((a, b) => b.annual_cost - a.annual_cost).map((d, i) => (
            <View key={i} style={[styles.deviceRow, { borderBottomColor: colors.border }]}>
              <View style={{ marginRight: 12 }}>
                <Appliance3DModel category={d.category} size={36} showLabel={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.deviceLabel, { color: colors.text }]}>{d.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {d.category} • {d.annual_kwh.toFixed(0)} kWh/yr
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 15 }}>
                  ${d.annual_cost.toFixed(2)}/yr
                </Text>
                <Text style={{ color: '#FF9800', fontSize: 11 }}>
                  Ghost: ${d.standby_annual_cost.toFixed(2)}/yr
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerSub: { fontSize: 14, marginTop: 4 },
  toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 16, marginBottom: 16 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  toggleText: { fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 4 },
  savingsCard: { marginHorizontal: 20, borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 16 },
  chartCard: { marginHorizontal: 20, borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16 },
  chartTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legendCol: { flex: 1, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  deviceLabel: { fontSize: 15, fontWeight: '600' },
});
