/**
 * UploadScanScreen — Web MVP for uploading appliance images
 *
 * Flow: Pick file → Preview → Upload to /scan → Show results + power profile
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { uploadScanImage } from '../services/apiService';

interface UploadScanScreenProps {
  onBack: () => void;
  onScanComplete?: (result: ScanResultData) => void;
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

export function UploadScanScreen({ onBack, onScanComplete }: UploadScanScreenProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResultData | null>(null);

  // ── File picker (web) ─────────────────────────────────────────────────
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
      }
    };
    input.click();
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!imageUri) return;
    setUploading(true);
    setError(null);

    try {
      const data = await uploadScanImage(imageUri);
      const scanData = data?.data as ScanResultData;
      setResult(scanData);
      onScanComplete?.(scanData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }, [imageUri, onScanComplete]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setImageUri(null);
    setImageFile(null);
    setResult(null);
    setError(null);
  }, []);

  const appliance = result?.detected_appliance;
  const power = result?.power_profile?.profile;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Appliance</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Upload area */}
        {!imageUri ? (
          <TouchableOpacity style={styles.dropZone} onPress={handlePickImage}>
            <Text style={styles.dropIcon}>📷</Text>
            <Text style={styles.dropTitle}>Upload Appliance Photo</Text>
            <Text style={styles.dropSubtitle}>
              Click to select a JPEG or PNG image of your appliance
            </Text>
            <View style={styles.browseButton}>
              <Text style={styles.browseText}>Browse Files</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View>
            {/* Preview */}
            <View style={styles.previewContainer}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            </View>

            {/* Action buttons */}
            {!result && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.retakeBtn} onPress={handleReset}>
                  <Text style={styles.retakeBtnText}>Change Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scanBtn, uploading && styles.disabledBtn]}
                  onPress={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.scanBtnText}>⚡ Analyze</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            )}

            {/* Results */}
            {result && appliance && (
              <View style={styles.resultsSection}>
                {/* Detection Card */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardIcon}>🔍</Text>
                    <Text style={styles.cardTitle}>Detected Appliance</Text>
                  </View>
                  <View style={styles.statGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{appliance.name}</Text>
                      <Text style={styles.statLabel}>Type</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{appliance.brand}</Text>
                      <Text style={styles.statLabel}>Brand</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{appliance.model}</Text>
                      <Text style={styles.statLabel}>Model</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {Math.round(appliance.confidence * 100)}%
                      </Text>
                      <Text style={styles.statLabel}>Confidence</Text>
                    </View>
                  </View>
                </View>

                {/* Power Profile Card */}
                {power && (
                  <View style={[styles.card, styles.powerCard]}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardIcon}>⚡</Text>
                      <Text style={styles.cardTitle}>Power Profile</Text>
                    </View>
                    <View style={styles.powerGrid}>
                      <View style={styles.powerItem}>
                        <Text style={styles.powerValue}>
                          {power.active_watts_typical}W
                        </Text>
                        <Text style={styles.powerLabel}>Active Power</Text>
                        <Text style={styles.powerRange}>
                          Range: {power.active_watts_range[0]}–{power.active_watts_range[1]}W
                        </Text>
                      </View>
                      <View style={styles.powerItem}>
                        <Text style={styles.powerValue}>
                          {power.standby_watts_typical}W
                        </Text>
                        <Text style={styles.powerLabel}>Standby Power</Text>
                        <Text style={styles.powerRange}>
                          Range: {power.standby_watts_range[0]}–{power.standby_watts_range[1]}W
                        </Text>
                      </View>
                    </View>
                    <View style={styles.powerMeta}>
                      <Text style={styles.powerMetaText}>
                        Monthly est: ~${(power.active_watts_typical * 8 * 30 * 0.12 / 1000).toFixed(2)}/mo
                        (8h/day @ $0.12/kWh)
                      </Text>
                      <Text style={styles.powerMetaText}>
                        Source: {power.source} · Confidence: {Math.round(power.confidence * 100)}%
                      </Text>
                    </View>
                  </View>
                )}

                {/* OCR Texts */}
                {result.ocr_texts && result.ocr_texts.length > 0 && (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardIcon}>📝</Text>
                      <Text style={styles.cardTitle}>Text Detected (OCR)</Text>
                    </View>
                    <Text style={styles.ocrText}>
                      {result.ocr_texts.join(' · ')}
                    </Text>
                  </View>
                )}

                {/* Scan Another */}
                <TouchableOpacity style={styles.scanAnotherBtn} onPress={handleReset}>
                  <Text style={styles.scanAnotherText}>Scan Another Appliance</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
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
  content: { flex: 1 },
  contentInner: { padding: 20, maxWidth: 600, alignSelf: 'center', width: '100%' },

  // Drop zone
  dropZone: {
    borderWidth: 2, borderColor: '#4CAF50', borderStyle: 'dashed', borderRadius: 16,
    paddingVertical: 60, paddingHorizontal: 32, alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
  },
  dropIcon: { fontSize: 48, marginBottom: 16 },
  dropTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  dropSubtitle: { color: '#aaa', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  browseButton: {
    backgroundColor: '#4CAF50', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  browseText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Preview
  previewContainer: {
    borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a2e',
    height: 300, marginBottom: 16,
  },
  previewImage: { width: '100%', height: '100%' },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  retakeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2,
    borderColor: '#555', alignItems: 'center',
  },
  retakeBtnText: { color: '#ccc', fontSize: 16, fontWeight: '600' },
  scanBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#4CAF50', alignItems: 'center',
  },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledBtn: { opacity: 0.6 },

  // Error
  errorBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)', padding: 12,
    borderRadius: 8, marginBottom: 16,
  },
  errorText: { color: '#f44336', fontSize: 14, textAlign: 'center' },

  // Results
  resultsSection: { gap: 16 },
  card: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: '#2a2a3e',
  },
  powerCard: { borderColor: '#4CAF50' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardIcon: { fontSize: 20, marginRight: 8 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  statItem: {
    backgroundColor: '#2a2a3e', borderRadius: 8, padding: 12,
    minWidth: 100, flex: 1,
  },
  statValue: { color: '#4CAF50', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  statLabel: { color: '#888', fontSize: 12 },

  powerGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  powerItem: {
    flex: 1, backgroundColor: 'rgba(76, 175, 80, 0.1)', borderRadius: 8, padding: 16,
    alignItems: 'center',
  },
  powerValue: { color: '#4CAF50', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  powerLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  powerRange: { color: '#888', fontSize: 11 },

  powerMeta: { backgroundColor: '#2a2a3e', borderRadius: 8, padding: 12 },
  powerMetaText: { color: '#aaa', fontSize: 12, marginBottom: 2 },

  ocrText: { color: '#ccc', fontSize: 14, lineHeight: 22 },

  scanAnotherBtn: {
    backgroundColor: '#2a2a3e', paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#4CAF50',
  },
  scanAnotherText: { color: '#4CAF50', fontSize: 16, fontWeight: '700' },
});
