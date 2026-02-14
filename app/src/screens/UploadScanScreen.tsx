/**
 * UploadScanScreen — Upload appliance images and analyze power consumption
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { uploadScanImage, checkHealth } from '../services/apiService';

interface UploadScanScreenProps {
  onBack: () => void;
  onScanComplete?: (result: ScanResultData) => void;
  onViewDashboard?: () => void;
}

interface DetectedAppliance {
  brand: string;
  model: string;
  name: string;
  category: string;
  confidence: number;
}

interface PowerProfile {
  brand: string;
  model: string;
  name: string;
  region: string;
  profile: {
    category: string;
    standby_watts_range: number[];
    standby_watts_typical: number;
    active_watts_range: number[];
    active_watts_typical: number;
    confidence: number;
    source: string;
    notes: string[];
  };
  cached: boolean;
}

export interface ScanResultData {
  detected_appliance: DetectedAppliance;
  power_profile: PowerProfile | null;
  ocr_texts: string[];
  detections: Array<{ label: string; category: string; score: number }>;
}

type ScanStep = 'idle' | 'uploading' | 'detecting' | 'analyzing' | 'complete' | 'error';

const SCAN_STEPS = [
  { key: 'uploading', label: 'Uploading image...', icon: '📤' },
  { key: 'detecting', label: 'AI detecting appliance...', icon: '🔍' },
  { key: 'analyzing', label: 'Analyzing power usage...', icon: '⚡' },
  { key: 'complete', label: 'Analysis complete!', icon: '✅' },
];

export function UploadScanScreen({ onBack, onScanComplete, onViewDashboard }: UploadScanScreenProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scanStep, setScanStep] = useState<ScanStep>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  
  // Pulse animation for scanning state
  useEffect(() => {
    if (['uploading', 'detecting', 'analyzing'].includes(scanStep)) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [scanStep, pulseAnim]);
  
  // Fade in results
  useEffect(() => {
    if (scanStep === 'complete') {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
    }
  }, [scanStep, fadeAnim, slideAnim]);
  const [result, setResult] = useState<ScanResultData | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState<boolean>(true);
  const [usageHours, setUsageHours] = useState<number>(4);

  // Poll health endpoint
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const health = await checkHealth();
        if (!mounted) return;
        setModelsLoaded(Boolean(health?.models_loaded));
        if (!health?.models_loaded) {
          setTimeout(poll, 2000);
        }
      } catch {
        if (mounted) setModelsLoaded(true);
        setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { mounted = false; };
  }, []);

  // File picker
  const handlePickImage = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setImageFile(file);
        setImageUri(URL.createObjectURL(file));
        setResult(null);
        setError(null);
        setScanStep('idle');
      }
    };
    input.click();
  }, []);

  // Upload with step progress
  const handleUpload = useCallback(async () => {
    if (!imageUri && !imageFile) return;
    setError(null);
    
    setScanStep('uploading');
    
    try {
      await new Promise(r => setTimeout(r, 300));
      setScanStep('detecting');
      
      const data = await uploadScanImage(imageFile ?? imageUri!);
      
      setScanStep('analyzing');
      await new Promise(r => setTimeout(r, 200));
      
      const scanData = data?.data as ScanResultData;
      setResult(scanData);
      setScanStep('complete');
      onScanComplete?.(scanData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setScanStep('error');
    }
  }, [imageFile, imageUri, onScanComplete]);

  // Reset
  const handleReset = useCallback(() => {
    setImageUri(null);
    setImageFile(null);
    setResult(null);
    setError(null);
    setScanStep('idle');
  }, []);

  const appliance = result?.detected_appliance;
  const power = result?.power_profile?.profile;
  const isScanning = ['uploading', 'detecting', 'analyzing'].includes(scanStep);

  // Calculate costs
  const dailyKwh = power ? (power.active_watts_typical * usageHours) / 1000 : 0;
  const monthlyKwh = dailyKwh * 30;
  const monthlyCost = monthlyKwh * 0.12;
  const yearlyKwh = monthlyKwh * 12;
  const yearlyCost = yearlyKwh * 0.12;
  const standbyYearlyCost = power ? (power.standby_watts_typical * 24 * 365 * 0.12) / 1000 : 0;

  // Environmental impact calculations
  // US average: 0.92 lbs CO2 per kWh (EPA 2024)
  const CO2_PER_KWH = 0.92; // lbs
  const TREE_ABSORBS_PER_YEAR = 48; // lbs CO2 per tree per year
  const yearlyCO2 = yearlyKwh * CO2_PER_KWH;
  const treesNeeded = yearlyCO2 / TREE_ABSORBS_PER_YEAR;
  
  // Comparison with average
  const US_AVG_APPLIANCE_KWH = 200; // avg appliance yearly kWh
  const comparedToAvg = yearlyKwh > 0 ? ((yearlyKwh / US_AVG_APPLIANCE_KWH) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Appliance</Text>
        {onViewDashboard && (
          <TouchableOpacity onPress={onViewDashboard} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Dashboard →</Text>
          </TouchableOpacity>
        )}
        {!onViewDashboard && <View style={{ width: 80 }} />}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Model loading notice */}
        {!modelsLoaded && (
          <View style={styles.notice}>
            <ActivityIndicator size="small" color="#ffd54f" />
            <Text style={styles.noticeText}>Loading AI models... First scan may be slower.</Text>
          </View>
        )}

        {/* Upload area */}
        {!imageUri ? (
          <TouchableOpacity style={styles.dropZone} onPress={handlePickImage}>
            <View style={styles.dropIconContainer}>
              <Text style={styles.dropIcon}>📷</Text>
            </View>
            <Text style={styles.dropTitle}>Upload Appliance Photo</Text>
            <Text style={styles.dropSubtitle}>
              Take a clear photo of your appliance's front or label
            </Text>
            <View style={styles.browseButton}>
              <Text style={styles.browseText}>Select Image</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View>
            {/* Image Preview */}
            <View style={styles.previewCard}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            </View>

            {/* Scanning Progress */}
            {isScanning && (
              <Animated.View style={[styles.progressCard, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.progressTitle}>✨ Analyzing...</Text>
                <View style={styles.stepsContainer}>
                  {SCAN_STEPS.map((step, idx) => {
                    const currentIdx = SCAN_STEPS.findIndex(s => s.key === scanStep);
                    const isActive = step.key === scanStep;
                    const isDone = idx < currentIdx;
                    return (
                      <View key={step.key} style={styles.stepRow}>
                        <View style={[
                          styles.stepIndicator,
                          isDone && styles.stepDone,
                          isActive && styles.stepActive,
                        ]}>
                          {isDone ? (
                            <Text style={styles.stepCheck}>✓</Text>
                          ) : isActive ? (
                            <ActivityIndicator size="small" color="#4CAF50" />
                          ) : (
                            <Text style={styles.stepIcon}>{step.icon}</Text>
                          )}
                        </View>
                        <Text style={[
                          styles.stepLabel,
                          (isDone || isActive) && styles.stepLabelActive,
                        ]}>
                          {step.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            {/* Action buttons */}
            {scanStep === 'idle' && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleReset}>
                  <Text style={styles.secondaryBtnText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleUpload}>
                  <Text style={styles.primaryBtnText}>⚡ Analyze Power</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
                <TouchableOpacity onPress={handleUpload} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Results */}
            {result && appliance && scanStep === 'complete' && (
              <Animated.View style={[
                styles.resultsSection, 
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
              ]}>
                {/* Success celebration */}
                <View style={styles.successBanner}>
                  <Text style={styles.successIcon}>🎉</Text>
                  <Text style={styles.successText}>Device Identified!</Text>
                </View>
                
                {/* Detection Result */}
                <View style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryIcon}>
                        {getCategoryIcon(appliance.category)}
                      </Text>
                      <Text style={styles.categoryText}>{appliance.category}</Text>
                    </View>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>
                        {Math.round(appliance.confidence * 100)}% match
                      </Text>
                    </View>
                  </View>
                  
                  {appliance.brand !== 'Unknown' && (
                    <Text style={styles.brandModel}>
                      {appliance.brand} {appliance.model !== 'Unknown' ? appliance.model : ''}
                    </Text>
                  )}
                </View>

                {/* Power Analysis */}
                {power && (
                  <View style={styles.powerCard}>
                    <Text style={styles.powerTitle}>Power Consumption</Text>
                    <Text style={styles.powerSource}>
                      Data: {power.source === 'category_default' ? 'Berkeley Lab Estimates' : power.source}
                    </Text>
                    
                    <View style={styles.powerMain}>
                      <View style={styles.powerStat}>
                        <Text style={styles.powerValue}>{power.active_watts_typical}</Text>
                        <Text style={styles.powerUnit}>W</Text>
                        <Text style={styles.powerLabel}>Active</Text>
                      </View>
                      <View style={styles.powerDivider} />
                      <View style={styles.powerStat}>
                        <Text style={[styles.powerValue, styles.standbyValue]}>{power.standby_watts_typical}</Text>
                        <Text style={styles.powerUnit}>W</Text>
                        <Text style={styles.powerLabel}>Standby</Text>
                      </View>
                    </View>

                    {/* Usage Slider */}
                    <View style={styles.usageSection}>
                      <Text style={styles.usageTitle}>Daily Usage</Text>
                      <View style={styles.usageButtons}>
                        {[1, 2, 4, 6, 8, 12].map((h) => (
                          <TouchableOpacity
                            key={h}
                            style={[styles.usageBtn, usageHours === h && styles.usageBtnActive]}
                            onPress={() => setUsageHours(h)}
                          >
                            <Text style={[styles.usageBtnText, usageHours === h && styles.usageBtnTextActive]}>
                              {h}h
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Cost Breakdown */}
                    <View style={styles.costGrid}>
                      <View style={styles.costItem}>
                        <Text style={styles.costValue}>{dailyKwh.toFixed(2)}</Text>
                        <Text style={styles.costLabel}>kWh/day</Text>
                      </View>
                      <View style={styles.costItem}>
                        <Text style={styles.costValue}>${monthlyCost.toFixed(2)}</Text>
                        <Text style={styles.costLabel}>per month</Text>
                      </View>
                      <View style={styles.costItem}>
                        <Text style={styles.costValue}>${yearlyCost.toFixed(0)}</Text>
                        <Text style={styles.costLabel}>per year</Text>
                      </View>
                      <View style={[styles.costItem, styles.standbyItem]}>
                        <Text style={[styles.costValue, styles.standbyCost]}>${standbyYearlyCost.toFixed(0)}</Text>
                        <Text style={styles.costLabel}>standby/yr</Text>
                      </View>
                    </View>

                    {/* Tip */}
                    {standbyYearlyCost > 5 && (
                      <View style={styles.tipBox}>
                        <Text style={styles.tipIcon}>💡</Text>
                        <Text style={styles.tipText}>
                          Standby power costs ${standbyYearlyCost.toFixed(0)}/year! 
                          Use a smart power strip to save.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Environmental Impact Card */}
                {power && yearlyKwh > 0 && (
                  <View style={styles.envCard}>
                    <Text style={styles.envTitle}>🌍 Environmental Impact</Text>
                    <View style={styles.envGrid}>
                      <View style={styles.envItem}>
                        <Text style={styles.envValue}>{yearlyCO2.toFixed(1)}</Text>
                        <Text style={styles.envLabel}>lbs CO₂/year</Text>
                      </View>
                      <View style={styles.envItem}>
                        <Text style={[styles.envValue, styles.treeValue]}>🌳 {treesNeeded.toFixed(1)}</Text>
                        <Text style={styles.envLabel}>trees to offset</Text>
                      </View>
                    </View>
                    
                    {/* Efficiency Badge */}
                    <View style={[
                      styles.efficiencyBadge,
                      comparedToAvg <= 80 ? styles.efficiencyGood : 
                      comparedToAvg <= 120 ? styles.efficiencyAvg : styles.efficiencyPoor
                    ]}>
                      <Text style={styles.efficiencyIcon}>
                        {comparedToAvg <= 80 ? '🏆' : comparedToAvg <= 120 ? '👍' : '⚠️'}
                      </Text>
                      <Text style={styles.efficiencyText}>
                        {comparedToAvg <= 80 
                          ? `${(100 - comparedToAvg).toFixed(0)}% more efficient than average!` 
                          : comparedToAvg <= 120 
                            ? 'Average efficiency'
                            : `${(comparedToAvg - 100).toFixed(0)}% above average usage`}
                      </Text>
                    </View>

                    <Text style={styles.envNote}>Based on EPA emissions data (0.92 lbs CO₂/kWh)</Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.scanAnotherBtn} onPress={handleReset}>
                    <Text style={styles.scanAnotherText}>Scan Another</Text>
                  </TouchableOpacity>
                  {onViewDashboard && (
                    <TouchableOpacity style={styles.dashboardBtn} onPress={onViewDashboard}>
                      <Text style={styles.dashboardBtnText}>View Dashboard</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            )}
          </View>
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
    'Phone Charger': '🔌',
  };
  return icons[category] || '🔌';
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

  content: { flex: 1 },
  contentInner: { padding: 16, maxWidth: 500, alignSelf: 'center', width: '100%' },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 213, 79, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 213, 79, 0.3)',
    marginBottom: 16,
  },
  noticeText: { color: '#ffd54f', fontSize: 13 },

  // Drop zone
  dropZone: {
    borderWidth: 2,
    borderColor: '#2a2a3e',
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#12121a',
  },
  dropIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dropIcon: { fontSize: 36 },
  dropTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  dropSubtitle: { color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  browseButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  browseText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Preview
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#12121a',
    marginBottom: 16,
  },
  previewImage: { width: '100%', height: 240 },

  // Progress
  progressCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  progressTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  stepsContainer: { gap: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDone: { backgroundColor: '#4CAF50' },
  stepActive: { backgroundColor: 'rgba(76, 175, 80, 0.2)', borderWidth: 2, borderColor: '#4CAF50' },
  stepCheck: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stepIcon: { fontSize: 16 },
  stepLabel: { color: '#666', fontSize: 14 },
  stepLabelActive: { color: '#fff' },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#aaa', fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Error
  errorBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
    alignItems: 'center',
  },
  errorText: { color: '#f44336', fontSize: 14, marginBottom: 12 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#f44336', borderRadius: 8 },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Results
  resultsSection: { gap: 16 },
  
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  successIcon: { fontSize: 24 },
  successText: { color: '#4CAF50', fontSize: 18, fontWeight: '700' },
  
  resultCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f1f2e',
  },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  categoryIcon: { fontSize: 20 },
  categoryText: { color: '#4CAF50', fontSize: 15, fontWeight: '700' },
  confidenceBadge: {
    backgroundColor: '#1f1f2e',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  confidenceText: { color: '#888', fontSize: 12 },
  brandModel: { color: '#aaa', fontSize: 14, marginTop: 12 },

  // Power Card
  powerCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  powerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  powerSource: { color: '#4CAF50', fontSize: 12, marginBottom: 16 },
  
  powerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#0a0a12',
    borderRadius: 12,
    marginBottom: 16,
  },
  powerStat: { alignItems: 'center' },
  powerValue: { color: '#4CAF50', fontSize: 42, fontWeight: '800' },
  standbyValue: { color: '#FF9800' },
  powerUnit: { color: '#888', fontSize: 14, marginTop: -4 },
  powerLabel: { color: '#666', fontSize: 12, marginTop: 4 },
  powerDivider: { width: 1, height: 60, backgroundColor: '#2a2a3e' },

  // Usage selector
  usageSection: { marginBottom: 16 },
  usageTitle: { color: '#888', fontSize: 13, marginBottom: 10 },
  usageButtons: { flexDirection: 'row', gap: 8 },
  usageBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1f1f2e',
    borderRadius: 8,
    alignItems: 'center',
  },
  usageBtnActive: { backgroundColor: '#4CAF50' },
  usageBtnText: { color: '#888', fontSize: 13, fontWeight: '600' },
  usageBtnTextActive: { color: '#fff' },

  // Cost grid
  costGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  costItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1f1f2e',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  standbyItem: { backgroundColor: 'rgba(255, 152, 0, 0.1)' },
  costValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  standbyCost: { color: '#FF9800' },
  costLabel: { color: '#888', fontSize: 11, marginTop: 2 },

  // Tip
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 213, 79, 0.1)',
    borderRadius: 10,
  },
  tipIcon: { fontSize: 18 },
  tipText: { flex: 1, color: '#ffd54f', fontSize: 13, lineHeight: 18 },

  // Result actions
  resultActions: { flexDirection: 'row', gap: 12 },
  scanAnotherBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1f1f2e',
    alignItems: 'center',
  },
  scanAnotherText: { color: '#aaa', fontSize: 15, fontWeight: '600' },
  dashboardBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  dashboardBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Environmental Impact
  envCard: {
    backgroundColor: '#12121a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  envTitle: { color: '#4CAF50', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  envGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  envItem: {
    flex: 1,
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  envValue: { color: '#fff', fontSize: 24, fontWeight: '800' },
  treeValue: { color: '#4CAF50' },
  envLabel: { color: '#888', fontSize: 11, marginTop: 4, textAlign: 'center' },
  
  efficiencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  efficiencyGood: { backgroundColor: 'rgba(76, 175, 80, 0.15)' },
  efficiencyAvg: { backgroundColor: 'rgba(255, 193, 7, 0.15)' },
  efficiencyPoor: { backgroundColor: 'rgba(244, 67, 54, 0.15)' },
  efficiencyIcon: { fontSize: 20 },
  efficiencyText: { color: '#ccc', fontSize: 13, flex: 1 },
  
  envNote: { color: '#555', fontSize: 10, textAlign: 'center' },
});
