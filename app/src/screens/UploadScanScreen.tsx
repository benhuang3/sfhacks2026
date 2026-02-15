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
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { uploadScanImage, checkHealth } from '../services/apiService';
import { listHomes, addDevice, Home, RoomModel } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { useTheme } from '../../App';
import { Ionicons } from '@expo/vector-icons';
import { log } from '../utils/logger';

interface UploadScanScreenProps {
  onBack: () => void;
  onScanComplete?: (result: ScanResultData, imageUri?: string) => void;
  onViewDashboard?: () => void;
  onOpenCamera?: () => void;
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
  { key: 'uploading', label: 'Uploading image...', icon: 'cloud-upload-outline' },
  { key: 'detecting', label: 'AI detecting appliance...', icon: 'search-outline' },
  { key: 'analyzing', label: 'Analyzing power usage...', icon: 'flash-outline' },
  { key: 'complete', label: 'Analysis complete!', icon: 'checkmark-circle-outline' },
];

export function UploadScanScreen({ onBack, onScanComplete, onViewDashboard, onOpenCamera }: UploadScanScreenProps) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scanStep, setScanStep] = useState<ScanStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showAddToHome, setShowAddToHome] = useState(false);
  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('living-room');
  const [addingToHome, setAddingToHome] = useState(false);
  const [addedToHome, setAddedToHome] = useState(false);
  
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

  // Cross-platform image picker
  const handlePickImage = useCallback(async () => {
    log.scan('Pick image pressed');
    try {
      if (Platform.OS === 'web') {
        // Web: use file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            // Revoke previous blob URL to prevent memory leak
            if (imageUri && imageUri.startsWith('blob:')) URL.revokeObjectURL(imageUri);
            setImageFile(file);
            setImageUri(URL.createObjectURL(file));
            setResult(null);
            setError(null);
            setScanStep('idle');
            setShowAddToHome(false);
            setAddedToHome(false);
          }
        };
        input.click();
      } else {
        // Native: use expo-image-picker
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          setError('Permission to access photos is required.');
          return;
        }
        const pickResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (!pickResult.canceled && pickResult.assets[0]) {
          setImageUri(pickResult.assets[0].uri);
          setImageFile(null);
          setResult(null);
          setError(null);
          setScanStep('idle');
          setShowAddToHome(false);
          setAddedToHome(false);
        }
      }
    } catch (err) {
      log.error('scan', 'Failed to pick image', err);
      setError('Failed to pick image. Please try again.');
    }
  }, [imageUri]);

  // Launch camera directly (native only)
  const handleTakePhoto = useCallback(async () => {
    log.scan('Take photo pressed');
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission is required.');
        return;
      }
      const pickResult = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!pickResult.canceled && pickResult.assets[0]) {
        setImageUri(pickResult.assets[0].uri);
        setImageFile(null);
        setResult(null);
        setError(null);
        setScanStep('idle');
        setShowAddToHome(false);
        setAddedToHome(false);
      }
    } catch (err) {
      log.error('scan', 'Failed to take photo', err);
      setError('Failed to take photo. Please try again.');
    }
  }, []);

  // Add scanned device to home
  const handleAddToHome = useCallback(async () => {
    if (!result || !selectedHomeId) return;
    setAddingToHome(true);
    log.scan('Add to home pressed', { homeId: selectedHomeId, room: selectedRoom });
    try {
      const appliance = result.detected_appliance;
      const power = result.power_profile?.profile;
      await addDevice(selectedHomeId, {
        roomId: selectedRoom,
        label: appliance.name || `${appliance.brand} ${appliance.model}`,
        brand: appliance.brand,
        model: appliance.model,
        category: appliance.category,
        power: power ? {
          standby_watts_typical: power.standby_watts_typical,
          standby_watts_range: power.standby_watts_range as [number, number],
          active_watts_typical: power.active_watts_typical,
          active_watts_range: power.active_watts_range as [number, number],
          source: power.source,
          confidence: power.confidence,
        } : undefined,
        active_hours_per_day: usageHours,
      });
      setAddedToHome(true);
      setShowAddToHome(false);
      log.scan('Device added to home', { homeId: selectedHomeId, category: appliance.category });
    } catch (err) {
      log.error('scan', 'Failed to add device to home', err);
      setError(err instanceof Error ? err.message : 'Failed to add device');
    }
    setAddingToHome(false);
  }, [result, selectedHomeId, selectedRoom, usageHours]);

  // Upload with step progress
  const handleUpload = useCallback(async () => {
    if (!imageUri && !imageFile) return;
    setError(null);
    log.scan('Analyze power pressed — uploading image');

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
      log.scan('Scan complete', { category: scanData.detected_appliance.category, confidence: scanData.detected_appliance.confidence });
      onScanComplete?.(scanData, imageUri ?? undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      log.error('scan', 'Upload/scan failed', err);
      setError(msg);
      setScanStep('error');
    }
  }, [imageFile, imageUri, onScanComplete]);

  // Reset
  const handleReset = useCallback(() => {
    // Revoke blob URL to prevent memory leak
    if (imageUri && imageUri.startsWith('blob:')) URL.revokeObjectURL(imageUri);
    setImageUri(null);
    setImageFile(null);
    setResult(null);
    setError(null);
    setScanStep('idle');
    setShowAddToHome(false);
    setAddedToHome(false);
  }, [imageUri]);

  const appliance = result?.detected_appliance;
  const power = result?.power_profile?.profile;
  const isScanning = ['uploading', 'detecting', 'analyzing'].includes(scanStep);

  // Calculate costs — consistent $0.30/kWh rate
  const RATE_PER_KWH = 0.30;
  const dailyKwh = power ? (power.active_watts_typical * usageHours) / 1000 : 0;
  const monthlyKwh = dailyKwh * 30;
  const monthlyCost = monthlyKwh * RATE_PER_KWH;
  const yearlyKwh = monthlyKwh * 12;
  const yearlyCost = yearlyKwh * RATE_PER_KWH;
  const standbyYearlyCost = power ? (power.standby_watts_typical * 24 * 365 * RATE_PER_KWH) / 1000 : 0;

  // Environmental impact calculations — kg CO₂ (consistent with backend)
  const CO2_PER_KWH = 0.25; // kg CO₂/kWh
  const TREE_ABSORBS_PER_YEAR = 21.77; // kg CO₂ per tree per year (EPA)
  const yearlyCO2 = yearlyKwh * CO2_PER_KWH;
  const treesNeeded = yearlyCO2 / TREE_ABSORBS_PER_YEAR;
  
  // Comparison with average
  const US_AVG_APPLIANCE_KWH = 200; // avg appliance yearly kWh
  const comparedToAvg = yearlyKwh > 0 ? ((yearlyKwh / US_AVG_APPLIANCE_KWH) * 100) : 0;

  // Load homes when result arrives
  useEffect(() => {
    if (result && user) {
      listHomes(user.id).then(h => {
        setHomes(h);
        if (h.length > 0) setSelectedHomeId(h[0].id);
      }).catch(() => {});
    }
  }, [result, user]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Scan Appliance</Text>
        {onViewDashboard && (
          <TouchableOpacity onPress={onViewDashboard} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: colors.accent }]}>Dashboard →</Text>
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
          <View>
            <TouchableOpacity style={[styles.dropZone, { borderColor: colors.accent + '40', backgroundColor: colors.card }]} onPress={handlePickImage}>
              <View style={[styles.dropIconContainer, { backgroundColor: isDark ? 'rgba(76,175,80,0.12)' : 'rgba(76,175,80,0.08)' }]}>
                <Ionicons name="camera-outline" size={36} color={colors.accent} />
              </View>
              <Text style={[styles.dropTitle, { color: colors.text }]}>Scan Your Appliance</Text>
              <Text style={[styles.dropSubtitle, { color: colors.textSecondary }]}>
                Snap a photo of any home appliance to analyze its energy usage
              </Text>
              <View style={[styles.browseButton, { backgroundColor: colors.accent }]}>
                <Ionicons name="images-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.browseText}>Select from Gallery</Text>
              </View>
            </TouchableOpacity>

            {/* Scan tips */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16, marginBottom: 4 }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Ionicons name="sunny-outline" size={20} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Good lighting</Text>
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Ionicons name="expand-outline" size={20} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Full appliance</Text>
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Ionicons name="barcode-outline" size={20} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 10 }}>Include label</Text>
              </View>
            </View>

            {Platform.OS !== 'web' && (
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={handleTakePhoto}>
                <Text style={styles.primaryBtnText}><Ionicons name="camera" size={16} color="#fff" /> Take Photo</Text>
              </TouchableOpacity>
            )}
            {onOpenCamera && (
              <TouchableOpacity style={[styles.cameraScanBtn, { marginTop: 12 }]} onPress={onOpenCamera}>
                <Text style={styles.cameraScanBtnText}><Ionicons name="videocam-outline" size={16} color="#fff" /> Scan with Camera</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View>
            {/* Image Preview */}
            <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            </View>

            {/* Scanning Progress */}
            {isScanning && (
              <Animated.View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ scale: pulseAnim }] }]}>
                <Text style={[styles.progressTitle, { color: colors.text }]}><Ionicons name="sparkles-outline" size={18} color={colors.accent} /> Analyzing...</Text>
                <View style={styles.stepsContainer}>
                  {SCAN_STEPS.map((step, idx) => {
                    const currentIdx = SCAN_STEPS.findIndex(s => s.key === scanStep);
                    const isActive = step.key === scanStep;
                    const isDone = idx < currentIdx;
                    return (
                      <View key={step.key} style={styles.stepRow}>
                        <View style={[
                          styles.stepIndicator,
                          { backgroundColor: isDark ? '#1f1f2e' : '#e0e0e0' },
                          isDone && styles.stepDone,
                          isActive && styles.stepActive,
                        ]}>
                          {isDone ? (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          ) : isActive ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <Ionicons name={step.icon as any} size={16} color={colors.textSecondary} />
                          )}
                        </View>
                        <Text style={[
                          styles.stepLabel,
                          { color: colors.textSecondary },
                          (isDone || isActive) && { color: colors.text },
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
                <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: isDark ? '#1f1f2e' : '#e0e0e0' }]} onPress={handleReset}>
                  <Text style={[styles.secondaryBtnText, { color: isDark ? '#aaa' : '#555' }]}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleUpload}>
                  <Text style={styles.primaryBtnText}><Ionicons name="flash-outline" size={14} color="#fff" /> Analyze Power</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}><Ionicons name="warning-outline" size={14} color="#ff6b6b" /> {error}</Text>
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
                  <Ionicons name="checkmark-circle-outline" size={32} color="#4CAF50" />
                  <Text style={styles.successText}>Device Identified!</Text>
                </View>
                
                {/* Detection Result */}
                <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.resultHeader}>
                    <View style={[styles.categoryBadge, { backgroundColor: isDark ? 'rgba(76,175,80,0.1)' : 'rgba(76,175,80,0.08)' }]}>
                      <Appliance3DModel category={appliance.category} size={36} showLabel={false} />
                      <Text style={[styles.categoryText, { color: colors.accent }]}>{appliance.category}</Text>
                    </View>
                    <View style={[styles.confidenceBadge, { backgroundColor: isDark ? '#1f1f2e' : '#e8e8e8' }]}>
                      <Text style={[styles.confidenceText, { color: colors.textSecondary }]}>
                        {Math.round(appliance.confidence * 100)}% match
                      </Text>
                    </View>
                  </View>
                  
                  {appliance.brand !== 'Unknown' && (
                    <Text style={[styles.brandModel, { color: colors.textSecondary }]}>
                      {appliance.brand} {appliance.model !== 'Unknown' ? appliance.model : ''}
                    </Text>
                  )}
                </View>

                {/* Power Analysis */}
                {power && (
                  <View style={[styles.powerCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
                    <Text style={[styles.powerTitle, { color: colors.text }]}>Power Consumption</Text>
                    <Text style={[styles.powerSource, { color: colors.accent }]}>
                      Data: {power.source === 'category_default' ? 'Berkeley Lab Estimates' : power.source}
                    </Text>
                    
                    <View style={[styles.powerMain, { backgroundColor: isDark ? '#0a0a12' : '#f0f0f0' }]}>
                      <View style={styles.powerStat}>
                        <Text style={[styles.powerValue, { color: colors.accent }]}>{power.active_watts_typical}</Text>
                        <Text style={[styles.powerUnit, { color: colors.textSecondary }]}>W</Text>
                        <Text style={[styles.powerLabel, { color: colors.textSecondary }]}>Active</Text>
                      </View>
                      <View style={[styles.powerDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.powerStat}>
                        <Text style={[styles.powerValue, styles.standbyValue]}>{power.standby_watts_typical}</Text>
                        <Text style={[styles.powerUnit, { color: colors.textSecondary }]}>W</Text>
                        <Text style={[styles.powerLabel, { color: colors.textSecondary }]}>Standby</Text>
                      </View>
                    </View>

                    {/* Usage Slider */}
                      <View style={styles.usageSection}>
                      <Text style={[styles.usageTitle, { color: colors.textSecondary }]}>Daily Usage</Text>
                      <View style={styles.usageButtons}>
                        {[1, 2, 4, 6, 8, 12].map((h) => (
                          <TouchableOpacity
                            key={h}
                            style={[styles.usageBtn, { backgroundColor: isDark ? '#1f1f2e' : '#e0e0e0' }, usageHours === h && styles.usageBtnActive]}
                            onPress={() => setUsageHours(h)}
                          >
                            <Text style={[styles.usageBtnText, { color: colors.textSecondary }, usageHours === h && styles.usageBtnTextActive]}>
                              {h}h
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Cost Breakdown */}
                    <View style={styles.costGrid}>
                      <View style={[styles.costItem, { backgroundColor: isDark ? '#1f1f2e' : '#f0f0f0' }]}>
                        <Text style={[styles.costValue, { color: colors.text }]}>{dailyKwh.toFixed(2)}</Text>
                        <Text style={[styles.costLabel, { color: colors.textSecondary }]}>kWh/day</Text>
                      </View>
                      <View style={[styles.costItem, { backgroundColor: isDark ? '#1f1f2e' : '#f0f0f0' }]}>
                        <Text style={[styles.costValue, { color: colors.text }]}>${monthlyCost.toFixed(2)}</Text>
                        <Text style={[styles.costLabel, { color: colors.textSecondary }]}>per month</Text>
                      </View>
                      <View style={[styles.costItem, { backgroundColor: isDark ? '#1f1f2e' : '#f0f0f0' }]}>
                        <Text style={[styles.costValue, { color: colors.text }]}>${yearlyCost.toFixed(0)}</Text>
                        <Text style={[styles.costLabel, { color: colors.textSecondary }]}>per year</Text>
                      </View>
                      <View style={[styles.costItem, styles.standbyItem]}>
                        <Text style={[styles.costValue, styles.standbyCost]}>${standbyYearlyCost.toFixed(0)}</Text>
                        <Text style={[styles.costLabel, { color: colors.textSecondary }]}>standby/yr</Text>
                      </View>
                    </View>

                    {/* Tip */}
                    {standbyYearlyCost > 5 && (
                      <View style={styles.tipBox}>
                        <Text style={styles.tipIcon}><Ionicons name="bulb-outline" size={18} color="#FFD700" /></Text>
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
                  <View style={[styles.envCard, { backgroundColor: colors.card, borderColor: '#2E7D32' }]}>
                    <Text style={[styles.envTitle, { color: colors.accent }]}><Ionicons name="globe-outline" size={14} color={colors.accent} /> Environmental Impact</Text>
                    <View style={styles.envGrid}>
                      <View style={[styles.envItem, { backgroundColor: isDark ? '#1a1a24' : '#f0f0f0' }]}>
                        <Text style={[styles.envValue, { color: colors.text }]}>{yearlyCO2.toFixed(1)}</Text>
                        <Text style={[styles.envLabel, { color: colors.textSecondary }]}>kg CO₂/year</Text>
                      </View>
                      <View style={[styles.envItem, { backgroundColor: isDark ? '#1a1a24' : '#f0f0f0' }]}>
                        <Text style={[styles.envValue, styles.treeValue]}><Ionicons name="leaf-outline" size={14} color="#4CAF50" /> {treesNeeded.toFixed(1)}</Text>
                        <Text style={[styles.envLabel, { color: colors.textSecondary }]}>trees to offset</Text>
                      </View>
                    </View>
                    
                    {/* Efficiency Badge */}
                    <View style={[
                      styles.efficiencyBadge,
                      comparedToAvg <= 80 ? styles.efficiencyGood : 
                      comparedToAvg <= 120 ? styles.efficiencyAvg : styles.efficiencyPoor
                    ]}>
                      <Text style={styles.efficiencyIcon}>
                        <Ionicons name={comparedToAvg <= 80 ? 'trophy-outline' : comparedToAvg <= 120 ? 'thumbs-up-outline' : 'warning-outline'} size={18} color={comparedToAvg <= 80 ? '#4CAF50' : comparedToAvg <= 120 ? '#FF9800' : '#F44336'} />
                      </Text>
                      <Text style={[styles.efficiencyText, { color: colors.textSecondary }]}>
                        {comparedToAvg <= 80 
                          ? `${(100 - comparedToAvg).toFixed(0)}% more efficient than average!` 
                          : comparedToAvg <= 120 
                            ? 'Average efficiency'
                            : `${(comparedToAvg - 100).toFixed(0)}% above average usage`}
                      </Text>
                    </View>

                    <Text style={[styles.envNote, { color: colors.textSecondary }]}>Based on EPA emissions data (0.25 kg CO₂/kWh)</Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.resultActions}>
                  <TouchableOpacity style={[styles.scanAnotherBtn, { backgroundColor: isDark ? '#1f1f2e' : '#e0e0e0' }]} onPress={handleReset}>
                    <Text style={[styles.scanAnotherText, { color: isDark ? '#aaa' : '#555' }]}>Scan Another</Text>
                  </TouchableOpacity>
                  {onViewDashboard && (
                    <TouchableOpacity style={styles.dashboardBtn} onPress={onViewDashboard}>
                      <Text style={styles.dashboardBtnText}>View Dashboard</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Add to Home */}
                {!addedToHome && homes.length > 0 && (
                  <View style={[styles.addToHomeCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8f8f8', borderColor: colors.border }]}>
                    <Text style={[styles.addToHomeTitle, { color: colors.text }]}><Ionicons name="download-outline" size={16} color={colors.accent} /> Add to My Home</Text>
                    <Text style={[styles.addToHomeSub, { color: colors.textSecondary }]}>Save this device to track energy</Text>
                    
                    {!showAddToHome ? (
                      <TouchableOpacity
                        style={[styles.primaryBtn, { marginTop: 12 }]}
                        onPress={() => setShowAddToHome(true)}
                      >
                        <Text style={styles.primaryBtnText}>+ Add to Home</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>Select Home:</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {homes.map(h => (
                            <TouchableOpacity
                              key={h.id}
                              style={[styles.roomChip, selectedHomeId === h.id && styles.roomChipActive]}
                              onPress={() => {
                                setSelectedHomeId(h.id);
                                if (h.rooms.length > 0) setSelectedRoom((h.rooms[0] as RoomModel).roomId ?? h.rooms[0] as unknown as string);
                              }}
                            >
                              <Text style={[styles.roomChipText, selectedHomeId === h.id && styles.roomChipTextActive]}>
                                {h.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {selectedHomeId && (
                          <>
                            <Text style={{ color: '#aaa', fontSize: 12, marginTop: 12, marginBottom: 6 }}>Room:</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {(homes.find(h => h.id === selectedHomeId)?.rooms ?? [{ roomId: 'living-room', name: 'Living Room' }]).map((r: any) => {
                                const roomId = typeof r === 'string' ? r : r.roomId;
                                const roomName = typeof r === 'string' ? r.replace(/-/g, ' ') : r.name;
                                return (
                                <TouchableOpacity
                                  key={roomId}
                                  style={[styles.roomChip, selectedRoom === roomId && styles.roomChipActive]}
                                  onPress={() => setSelectedRoom(roomId)}
                                >
                                  <Text style={[styles.roomChipText, selectedRoom === roomId && styles.roomChipTextActive]}>
                                    {roomName}
                                  </Text>
                                </TouchableOpacity>
                                );
                              })}
                            </View>
                          </>
                        )}

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                          <TouchableOpacity
                            style={[styles.secondaryBtn, { flex: 1 }]}
                            onPress={() => setShowAddToHome(false)}
                          >
                            <Text style={styles.secondaryBtnText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.primaryBtn, { flex: 1 }, addingToHome && { opacity: 0.5 }]}
                            onPress={handleAddToHome}
                            disabled={addingToHome || !selectedHomeId}
                          >
                            {addingToHome ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.primaryBtnText}><Ionicons name="checkmark" size={16} color="#fff" /> Confirm</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {addedToHome && (
                  <View style={[styles.addToHomeCard, { borderColor: '#4CAF50' }]}>
                    <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: '700' }}>
                      <Ionicons name="checkmark-circle" size={16} color="#4CAF50" /> Added to home! View in My Home tab.
                    </Text>
                  </View>
                )}

                {homes.length === 0 && user && (
                  <View style={styles.addToHomeCard}>
                    <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center' }}>
                      Create a home in the "My Home" tab to save scanned devices.
                    </Text>
                  </View>
                )}
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
    'Television': 'tv-outline',
    'Refrigerator': 'snow-outline',
    'Microwave': 'restaurant-outline',
    'Laptop': 'laptop-outline',
    'Oven': 'flame-outline',
    'Toaster': 'cafe-outline',
    'Hair Dryer': 'cut-outline',
    'Washing Machine': 'water-outline',
    'Dryer': 'water-outline',
    'Air Conditioner': 'snow-outline',
    'Space Heater': 'flame-outline',
    'Monitor': 'desktop-outline',
    'Light Bulb': 'bulb-outline',
    'Phone Charger': 'battery-charging-outline',
  };
  return icons[category] || 'power-outline';
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  cameraScanBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#4CAF50',
    alignItems: 'center',
  },
  cameraScanBtnText: { color: '#4CAF50', fontSize: 15, fontWeight: '700' },

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
  
  // Add to Home
  addToHomeCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  addToHomeTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addToHomeSub: { color: '#888', fontSize: 13, marginTop: 4 },
  roomChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  roomChipActive: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    borderColor: '#4CAF50',
  },
  roomChipText: { color: '#aaa', fontSize: 13 },
  roomChipTextActive: { color: '#4CAF50', fontWeight: '600' },
});
