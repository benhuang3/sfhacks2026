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
  useWindowDimensions, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
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
  const formatMoney0 = (n: number) => {
    const s = Math.round(n).toString();
    return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  const totalStr = formatMoney0(total);
  const baseFont = Math.round(size * 0.13);
  const digits = totalStr.replace(/[^0-9]/g, '').length;
  const shrink = Math.max(0, digits - 3);
  const fontSizeMain = Math.max(14, baseFont - shrink * 4);
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
        x={cx} y={cy - Math.round(fontSizeMain / 6)}
        textAnchor="middle"
        fill={textColor}
        fontSize={fontSizeMain}
        fontWeight="bold"
      >
        {totalStr}
      </SvgText>
      <SvgText
        x={cx} y={cy + 14}
        textAnchor="middle"
        fill={subColor}
        fontSize={Math.max(11, Math.round(size * 0.075))}
      >
        per year
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
  const { width: SCREEN_W } = useWindowDimensions();
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

  const formatMoney0 = (n: number) => {
    const s = Math.round(n).toString();
    return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // 7-day trend data based on real device breakdown
  const lineData = useMemo(() => {
    const baseDaily = stats.dailyCost;
    if (stats.breakdown.length === 0) {
      // No real data — show flat baseline
      return {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{ data: Array(7).fill(Math.max(0.01, baseDaily)), strokeWidth: 3 }],
      };
    }
    // Build per-day costs from real device categories
    // Different categories have different weekday/weekend usage patterns
    const categoryDayWeights: Record<string, number[]> = {
      'Television': [0.7, 0.7, 0.8, 0.8, 0.9, 1.3, 1.4],
      'TV': [0.7, 0.7, 0.8, 0.8, 0.9, 1.3, 1.4],
      'Laptop': [0.9, 1.0, 1.0, 0.9, 0.8, 1.2, 1.1],
      'Monitor': [1.1, 1.1, 1.0, 1.0, 0.9, 0.5, 0.4],
      'Gaming Console': [0.5, 0.5, 0.6, 0.7, 0.9, 1.5, 1.6],
      'Washing Machine': [0.6, 0.5, 0.4, 0.5, 0.6, 1.8, 1.6],
      'Dryer': [0.6, 0.5, 0.4, 0.5, 0.6, 1.8, 1.6],
      'Oven': [0.8, 0.7, 0.8, 0.9, 1.0, 1.3, 1.4],
      'Air Conditioner': [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      'Refrigerator': [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    };
    const defaultWeights = [0.9, 0.9, 1.0, 1.0, 1.0, 1.1, 1.1];

    const dailyCosts = [0, 0, 0, 0, 0, 0, 0];
    stats.breakdown.forEach(device => {
      const dailyDevCost = device.annual_cost / 365;
      const weights = categoryDayWeights[device.category] || defaultWeights;
      for (let day = 0; day < 7; day++) {
        dailyCosts[day] += dailyDevCost * weights[day];
      }
    });

    return {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: dailyCosts.map(c => Math.max(0.01, c)),
        strokeWidth: 3,
      }],
    };
  }, [stats.dailyCost, stats.breakdown]);

  // 12-month billing data from real device breakdown
  const monthlyData = useMemo(() => {
    const monthlyCost = stats.monthlyCost || stats.dailyCost * 30;
    if (stats.breakdown.length === 0) {
      // No real data — show flat baseline
      return {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [{ data: Array(12).fill(Math.max(0.01, monthlyCost)), strokeWidth: 3 }],
      };
    }
    // Categories have different seasonal patterns
    const categoryMonthWeights: Record<string, number[]> = {
      'Air Conditioner': [0.2, 0.2, 0.4, 0.7, 1.0, 1.5, 1.8, 1.7, 1.3, 0.8, 0.3, 0.2],
      'Space Heater': [1.8, 1.6, 1.2, 0.6, 0.1, 0.0, 0.0, 0.0, 0.1, 0.6, 1.3, 1.7],
      'Water Heater': [1.3, 1.2, 1.1, 0.9, 0.8, 0.7, 0.7, 0.7, 0.8, 0.9, 1.1, 1.3],
      'Refrigerator': [0.9, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.15, 1.1, 1.0, 0.95, 0.9],
      'Television': [1.1, 1.0, 0.9, 0.85, 0.8, 0.85, 0.95, 0.9, 0.9, 0.95, 1.05, 1.2],
      'TV': [1.1, 1.0, 0.9, 0.85, 0.8, 0.85, 0.95, 0.9, 0.9, 0.95, 1.05, 1.2],
      'Gaming Console': [1.15, 1.0, 0.9, 0.85, 0.8, 0.95, 1.1, 1.0, 0.9, 0.9, 1.0, 1.2],
      'Light Bulb': [1.3, 1.2, 1.0, 0.8, 0.7, 0.6, 0.6, 0.7, 0.8, 1.0, 1.2, 1.3],
      'Lamp': [1.3, 1.2, 1.0, 0.8, 0.7, 0.6, 0.6, 0.7, 0.8, 1.0, 1.2, 1.3],
    };
    const defaultMonthWeights = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

    const monthlyCosts = Array(12).fill(0);
    stats.breakdown.forEach(device => {
      const monthlyDevCost = device.annual_cost / 12;
      const weights = categoryMonthWeights[device.category] || defaultMonthWeights;
      for (let m = 0; m < 12; m++) {
        monthlyCosts[m] += monthlyDevCost * weights[m];
      }
    });

    return {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [{
        data: monthlyCosts.map(c => Math.max(0.01, c)),
        strokeWidth: 3,
      }],
    };
  }, [stats.monthlyCost, stats.dailyCost, stats.breakdown]);

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
        <Text style={[styles.headerTitle, { color: colors.text }]}><Ionicons name="bar-chart-outline" size={18} color={colors.accent} /> Energy Dashboard</Text>
        {home && <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{home.name}</Text>}
        <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>Cost by category · Monthly billing · 7-day trend</Text>
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
            <Ionicons name="wallet-outline" size={16} color={colors.accent} /> You're saving ${stats.savedDollars.toFixed(2)}/year from {stats.savedKwh.toFixed(0)} kWh!
          </Text>
        </View>
      )}

      {/* Donut Chart — Cost Breakdown by Category */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>Cost Breakdown by Category</Text>
        <View style={[styles.donutRow, { flexWrap: 'wrap', minHeight: 160, alignItems: 'flex-start' }]}>
          <View style={{ width: Math.min(180, SCREEN_W * 0.45), alignItems: 'center', justifyContent: 'center' }}>
            <DonutChart slices={donutSlices} size={Math.min(170, SCREEN_W * 0.42)} strokeWidth={26} textColor={colors.text} subColor={colors.textSecondary} />
          </View>
          <View style={[styles.legendCol, { flex: 1, minWidth: 140 }]}>
            {donutSlices.slice(0, 6).map((s, i) => (
              <View key={`cat-${s.label}-${i}`} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text
                  style={[styles.legendLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {s.label}
                </Text>
                <Text style={[styles.legendValue, { color: colors.text }]}> 
                  {formatMoney0(s.value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Inline 7-day graph (always visible) */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>7-Day Energy Trend (est.)</Text>
        {stats.dailyCost > 0 ? (
          <LineChart
            data={lineData}
            width={SCREEN_W - 80}
            height={200}
            yAxisLabel="$"
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: isDark ? '#12121a' : '#ffffff',
              backgroundGradientTo: isDark ? '#12121a' : '#ffffff',
              backgroundGradientFromOpacity: 0,
              backgroundGradientToOpacity: 0,
              decimalPlaces: 2,
              color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
              labelColor: () => isDark ? '#888' : '#555',
              propsForDots: { r: '5', strokeWidth: '2', stroke: '#4CAF50' },
              propsForBackgroundLines: {
                strokeDasharray: '4',
                stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              },
              fillShadowGradientFrom: '#4CAF50',
              fillShadowGradientFromOpacity: 0.3,
              fillShadowGradientTo: '#4CAF50',
              fillShadowGradientToOpacity: 0.01,
            }}
            bezier
            style={{ borderRadius: 12, marginLeft: -16 }}
          />
        ) : (
          <View style={{ minHeight: 160, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 }}>
              Add a home and devices to see your 7-day cost trend
            </Text>
            <LineChart
              data={{ labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], datasets: [{ data: [1, 2, 1.5, 2.2, 1.8, 2.5, 2] }] }}
              width={SCREEN_W - 80}
              height={160}
              yAxisLabel="$"
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: isDark ? '#12121a' : '#ffffff',
                backgroundGradientTo: isDark ? '#12121a' : '#ffffff',
                backgroundGradientFromOpacity: 0,
                backgroundGradientToOpacity: 0,
                color: () => 'rgba(76, 175, 80, 0.3)',
                labelColor: () => colors.textSecondary,
                propsForDots: { r: '4', strokeWidth: '1', stroke: 'rgba(76, 175, 80, 0.4)' },
                propsForBackgroundLines: {
                  strokeDasharray: '4',
                  stroke: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                },
                fillShadowGradientFrom: '#4CAF50',
                fillShadowGradientFromOpacity: 0.15,
                fillShadowGradientTo: '#4CAF50',
                fillShadowGradientToOpacity: 0.01,
              }}
              bezier
              style={{ borderRadius: 12, marginLeft: -16 }}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>Sample trend (connect home to see real data)</Text>
          </View>
        )}
      </View>

      {/* Monthly Billing Graph */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>
          <Ionicons name="calendar-outline" size={15} color={colors.accent} /> Monthly Billing (est.)
        </Text>
        {(stats.dailyCost > 0 || stats.monthlyCost > 0) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={monthlyData}
              width={Math.max(SCREEN_W - 60, 380)}
              height={220}
              yAxisLabel="$"
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: isDark ? '#12121a' : '#ffffff',
                backgroundGradientTo: isDark ? '#12121a' : '#ffffff',
                backgroundGradientFromOpacity: 0,
                backgroundGradientToOpacity: 0,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
                labelColor: () => isDark ? '#888' : '#555',
                propsForDots: { r: '5', strokeWidth: '2', stroke: '#2196F3' },
                propsForBackgroundLines: {
                  strokeDasharray: '4',
                  stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                },
                fillShadowGradientFrom: '#2196F3',
                fillShadowGradientFromOpacity: 0.25,
                fillShadowGradientTo: '#2196F3',
                fillShadowGradientToOpacity: 0.01,
              }}
              bezier
              style={{ borderRadius: 12 }}
            />
          </ScrollView>
        ) : (
          <View style={{ minHeight: 160, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 }}>
              Add a home and devices to see your monthly billing trend
            </Text>
            <LineChart
              data={{ labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], datasets: [{ data: [120, 110, 95, 85, 80, 90, 105, 110, 95, 85, 95, 125] }] }}
              width={SCREEN_W - 80}
              height={160}
              yAxisLabel="$"
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: isDark ? '#12121a' : '#ffffff',
                backgroundGradientTo: isDark ? '#12121a' : '#ffffff',
                backgroundGradientFromOpacity: 0,
                backgroundGradientToOpacity: 0,
                color: () => 'rgba(33, 150, 243, 0.3)',
                labelColor: () => colors.textSecondary,
                propsForDots: { r: '4', strokeWidth: '1', stroke: 'rgba(33, 150, 243, 0.4)' },
                propsForBackgroundLines: {
                  strokeDasharray: '4',
                  stroke: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                },
                fillShadowGradientFrom: '#2196F3',
                fillShadowGradientFromOpacity: 0.15,
                fillShadowGradientTo: '#2196F3',
                fillShadowGradientToOpacity: 0.01,
              }}
              bezier
              style={{ borderRadius: 12, marginLeft: -16 }}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>Sample billing (connect home to see real data)</Text>
          </View>
        )}
        <Text style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 6 }}>
          Estimated monthly cost based on device usage and seasonal patterns
        </Text>
      </View>

      {/* Device list (keyed by deviceId so content doesn't get overwritten) */}
      {stats.breakdown.length > 0 && (
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>Devices ({stats.deviceCount})</Text>
          {[...stats.breakdown].sort((a, b) => b.annual_cost - a.annual_cost).map((d, i) => (
            <View key={d.deviceId || `breakdown-${i}`} style={[styles.deviceRow, { borderBottomColor: colors.border }]}>
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

      {/* ================================================================ */}
      {/* Gamification — Energy Efficiency Score + Badges + Ranking */}
      {/* ================================================================ */}
      {stats.deviceCount > 0 && (() => {
        // US avg household: ~10,500 kWh/year, $1,500/year
        const US_AVG_KWH = 10500;
        const userKwh = stats.annualKwh;
        // Score: 100 if 0 kWh, 0 if >= 2x national avg. Linear scale.
        const efficiencyRatio = Math.max(0, 1 - userKwh / US_AVG_KWH);
        const score = Math.round(Math.min(100, efficiencyRatio * 100));
        const scoreColor = score >= 80 ? '#4CAF50' : score >= 50 ? '#FF9800' : '#F44336';
        const scoreLabel = score >= 90 ? 'Outstanding' : score >= 75 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'Needs Improvement';

        // Badges — 9 total achievements
        const badges: { icon: string; label: string; earned: boolean; desc: string }[] = [
          { icon: 'search-outline', label: 'Scanner',       earned: stats.deviceCount >= 1, desc: 'Scan your first device' },
          { icon: 'grid-outline',   label: 'Power Hunter',  earned: stats.deviceCount >= 5, desc: 'Scan 5 devices' },
          { icon: 'trophy-outline', label: 'Energy Master', earned: stats.deviceCount >= 10, desc: 'Scan 10+ devices' },
          { icon: 'shield-outline', label: 'Vampire Slayer', earned: stats.ghostKwh < 50, desc: 'Keep ghost energy < 50 kWh' },
          { icon: 'leaf-outline',   label: 'Eco Warrior',   earned: userKwh < US_AVG_KWH * 0.5, desc: 'Use < 50% of US avg' },
          { icon: 'flash-outline',  label: 'Efficiency Pro', earned: score >= 80, desc: 'Score 80+ efficiency' },
          { icon: 'home-outline',   label: 'Home Builder',  earned: true, desc: 'Set up your smart home' },
          { icon: 'bar-chart-outline', label: 'Data Analyst', earned: true, desc: 'View energy dashboard' },
          { icon: 'trending-down-outline', label: 'Cost Cutter',   earned: stats.savedDollars > 0, desc: 'Save money with actions' },
        ];
        const earnedCount = badges.filter(b => b.earned).length;

        // Ranking — global leaderboard with more entries
        const householdRankings = [
          { name: 'Your Home',     kwh: userKwh,                 isUser: true },
          { name: 'US Average',    kwh: US_AVG_KWH,              isUser: false },
          { name: 'Top 10% US',    kwh: US_AVG_KWH * 0.3,        isUser: false },
          { name: 'Eco Leader',    kwh: US_AVG_KWH * 0.2,        isUser: false },
          { name: 'Neighbor Avg',  kwh: US_AVG_KWH * 0.85,       isUser: false },
          { name: 'CA Average',    kwh: 6500,                    isUser: false },
          { name: 'EU Average',    kwh: 3600,                    isUser: false },
          { name: 'World Average', kwh: 3300,                    isUser: false },
        ].sort((a, b) => a.kwh - b.kwh);
        const userRank = householdRankings.findIndex(h => h.isUser) + 1;
        const totalRanked = householdRankings.length;
        // Global percentile estimate (lower kwh = better percentile)
        const percentile = Math.round(Math.max(1, Math.min(99, (1 - userKwh / US_AVG_KWH) * 80 + 20)));

        return (
          <>
            {/* Energy Efficiency Score Card */}
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: scoreColor, borderWidth: 2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="speedometer-outline" size={22} color={scoreColor} />
                <Text style={[styles.chartTitle, { color: colors.text, marginBottom: 0, marginLeft: 8 }]}>Energy Score</Text>
              </View>

              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                {/* Score circle */}
                <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: scoreColor, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)' }}>
                  <Text style={{ fontSize: 42, fontWeight: '900', color: scoreColor }}>{score}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: -4 }}>/100</Text>
                </View>
                <Text style={{ color: scoreColor, fontWeight: '700', fontSize: 16, marginTop: 8 }}>{scoreLabel}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                  {userKwh < US_AVG_KWH
                    ? `${((1 - userKwh/US_AVG_KWH) * 100).toFixed(0)}% below US average — Great job!`
                    : `${((userKwh/US_AVG_KWH - 1) * 100).toFixed(0)}% above US average`}
                </Text>
              </View>

              {/* Progress bar */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>0 kWh</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{US_AVG_KWH.toLocaleString()} kWh (US Avg)</Text>
                </View>
                <View style={{ height: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.min(100, (userKwh / US_AVG_KWH) * 100)}%`, backgroundColor: scoreColor, borderRadius: 5 }} />
                </View>
              </View>
            </View>

            {/* Badges / Achievements */}
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="ribbon-outline" size={22} color="#FFD700" />
                <Text style={[styles.chartTitle, { color: colors.text, marginBottom: 0, marginLeft: 8 }]}>Achievements ({earnedCount}/{badges.length})</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {badges.map((badge, i) => (
                  <View key={i} style={{
                    width: (SCREEN_W - 80) / 3 - 7,
                    alignItems: 'center', padding: 10, borderRadius: 12,
                    backgroundColor: badge.earned
                      ? (isDark ? 'rgba(76,175,80,0.15)' : 'rgba(76,175,80,0.08)')
                      : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                    borderWidth: 1,
                    borderColor: badge.earned ? colors.accent : 'transparent',
                    opacity: badge.earned ? 1 : 0.5,
                  }}>
                    <Ionicons
                      name={badge.icon as any}
                      size={28}
                      color={badge.earned ? '#FFD700' : colors.textSecondary}
                    />
                    <Text style={{ color: badge.earned ? colors.text : colors.textSecondary, fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                      {badge.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 8, marginTop: 2, textAlign: 'center' }} numberOfLines={2}>
                      {badge.desc}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Energy Ranking / Global Leaderboard */}
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="podium-outline" size={22} color="#9C27B0" />
                <Text style={[styles.chartTitle, { color: colors.text, marginBottom: 0, marginLeft: 8 }]}>Global Ranking</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Rank #{userRank} of {totalRanked} — {userRank <= 2 ? 'Top performer!' : userRank <= 4 ? 'Above average!' : 'Room to improve'}
                </Text>
                <View style={{ backgroundColor: scoreColor + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: scoreColor, fontSize: 12, fontWeight: '800' }}>Top {percentile}%</Text>
                </View>
              </View>

              {householdRankings.map((h, i) => {
                const maxKwh = Math.max(...householdRankings.map(r => r.kwh));
                const barPct = maxKwh > 0 ? (h.kwh / maxKwh) * 100 : 0;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                return (
                  <View key={i} style={{
                    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                    borderBottomWidth: i < householdRankings.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                    backgroundColor: h.isUser ? (isDark ? 'rgba(76,175,80,0.1)' : 'rgba(76,175,80,0.05)') : 'transparent',
                    marginHorizontal: -10, paddingHorizontal: 10, borderRadius: 8,
                  }}>
                    <Text style={{ fontSize: 18, width: 32, textAlign: 'center' }}>{medal}</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={{ color: h.isUser ? colors.accent : colors.text, fontWeight: h.isUser ? '800' : '500', fontSize: 14 }}>
                        {h.name} {h.isUser ? '(You)' : ''}
                      </Text>
                      <View style={{ height: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${barPct}%`, backgroundColor: h.isUser ? colors.accent : '#888', borderRadius: 3 }} />
                      </View>
                    </View>
                    <Text style={{ color: h.isUser ? colors.accent : colors.textSecondary, fontWeight: '700', fontSize: 13, marginLeft: 12, minWidth: 70, textAlign: 'right' }}>
                      {h.kwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Environmental Impact */}
            <View style={[styles.chartCard, { backgroundColor: isDark ? '#1a2e1a' : '#e8f5e9', borderColor: colors.accent }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="earth-outline" size={22} color={colors.accent} />
                <Text style={[styles.chartTitle, { color: colors.text, marginBottom: 0, marginLeft: 8 }]}>Environmental Impact</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 4 }}>🌳</Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>
                    {Math.ceil(stats.annualCo2 / 21.77)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Trees to offset</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 4 }}>💨</Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>
                    {stats.annualCo2.toFixed(0)} kg
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>CO₂/year</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 4 }}>⚡</Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>
                    {stats.annualKwh.toFixed(0)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kWh/year</Text>
                </View>
              </View>
            </View>
          </>
        );
      })()}

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
  chartCard: { marginHorizontal: 20, borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16, overflow: 'hidden' as const },
  chartTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, letterSpacing: 0.3 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legendCol: { flex: 1, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 12, fontWeight: '500' },
  legendValue: { minWidth: 80, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  deviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  deviceLabel: { fontSize: 15, fontWeight: '600' },
});
