/**
 * LiveScanScreen — Real-time camera preview with cloud-based Gemini Vision detection.
 *
 * Captures photos from the camera and sends them to the backend /scan endpoint
 * which uses Gemini Vision AI for accurate appliance detection.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { uploadScanImage } from '../services/apiService';
import { getDisplayName } from '../utils/applianceClasses';
import { log } from '../utils/logger';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiveScanScreenProps {
  onBack?: () => void;
  onCapture?: (scanData: any, imageUri: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveScanScreen({ onBack, onCapture }: LiveScanScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();

  // State
  const [isScanning, setIsScanning] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [detectedItems, setDetectedItems] = useState<Array<{label: string; confidence: number}>>([]);
  const [cameraLayout, setCameraLayout] = useState({ width: 1, height: 1 });
  const [statusMsg, setStatusMsg] = useState('Ready to scan');
  const isCapturingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Camera layout measurement
  const onCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCameraLayout({ width, height });
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-scan loop — captures and sends to Gemini Vision backend every 3s
  // ---------------------------------------------------------------------------
  const runCloudDetection = useCallback(async () => {
    if (isCapturingRef.current || !cameraRef.current || isAnalyzing) return;

    setIsAnalyzing(true);
    setStatusMsg('Analyzing...');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
        exif: false,
      });
      if (!photo?.uri) {
        setIsAnalyzing(false);
        setStatusMsg('Ready to scan');
        return;
      }

      const result = await uploadScanImage(photo.uri);
      log.scan('Cloud detection result', result);

      // Parse results from backend
      const candidates = (result as any).candidates || [];
      const detectedName = (result as any).detected_appliance?.name || '';
      const confidence = (result as any).detected_appliance?.confidence || 0;

      if (detectedName && detectedName !== 'Unknown') {
        const items: Array<{label: string; confidence: number}> = [];
        if (confidence > 0) {
          items.push({ label: detectedName, confidence });
        }
        candidates.forEach((c: any) => {
          if (c.category !== detectedName && c.confidence > 0.1) {
            items.push({ label: c.category, confidence: c.confidence });
          }
        });
        setDetectedItems(items.slice(0, 4));
        setLastResult(result);
        setStatusMsg(`${items.length} detected`);
      } else {
        setDetectedItems([]);
        setStatusMsg('No appliance detected');
      }
    } catch (err) {
      log.error('scan', 'Cloud detection error', err);
      setStatusMsg('Scan error — retrying...');
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  // Resume scanning when screen regains focus
  useEffect(() => {
    if (isFocused) setIsScanning(true);
  }, [isFocused]);

  // Start/stop auto-scan interval
  useEffect(() => {
    if (isScanning && isFocused) {
      intervalRef.current = setInterval(runCloudDetection, 3500);
      log.scan('Cloud detection loop started (3.5s interval)');
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isScanning, isFocused, runCloudDetection]);

  // ---------------------------------------------------------------------------
  // Capture — full-res photo + send to backend + navigate to confirm
  // ---------------------------------------------------------------------------
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturingRef.current) return;

    isCapturingRef.current = true;
    setIsScanning(false);
    setIsAnalyzing(true);
    setStatusMsg('Capturing...');
    log.scan('Capture pressed — taking full-res photo');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        exif: false,
      });
      if (!photo?.uri) {
        isCapturingRef.current = false;
        setIsScanning(true);
        setIsAnalyzing(false);
        setStatusMsg('Ready to scan');
        return;
      }

      setStatusMsg('Analyzing with Gemini AI...');
      const result = await uploadScanImage(photo.uri);
      log.scan('Capture scan complete', result);

      // Build scan data from backend response
      const scanData = {
        candidates: (result as any).candidates || [],
        bbox: (result as any).bbox || null,
        detected_appliance: (result as any).detected_appliance || {
          brand: 'Unknown',
          model: 'Unknown',
          name: 'Unknown',
          category: 'other',
          confidence: 0,
        },
        power_profile: (result as any).power_profile || null,
        ocr_texts: (result as any).ocr_texts || [],
        filename: photo.uri.split('/').pop() ?? 'capture.jpg',
        detections: ((result as any).candidates || []).map((c: any) => ({
          label: c.category,
          category: c.category,
          score: c.confidence,
        })),
      };

      isCapturingRef.current = false;
      setIsAnalyzing(false);
      onCapture?.(scanData, photo.uri);
    } catch (err) {
      log.error('scan', 'Capture failed', err);
      isCapturingRef.current = false;
      setIsScanning(true);
      setIsAnalyzing(false);
      setStatusMsg('Capture failed — try again');
    }
  }, [onCapture]);

  // ---------------------------------------------------------------------------
  // Permission not yet determined
  // ---------------------------------------------------------------------------
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.permissionText}>
          Camera access is needed to scan appliances.
        </Text>
        <TouchableOpacity
          style={styles.grantButton}
          onPress={requestPermission}
        >
          <Text style={styles.grantButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        {onBack && (
          <TouchableOpacity style={styles.backLink} onPress={onBack}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Main camera + overlay view
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onLayout={onCameraLayout}
      />

      {/* All overlays */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Analyzing overlay */}
        {isAnalyzing && (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={styles.analyzingText}>Gemini Vision AI</Text>
          </View>
        )}

        {/* Top bar */}
        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.topBackButton}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isScanning ? (isAnalyzing ? '#FFC107' : '#4CAF50') : '#888' },
              ]}
            />
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        </SafeAreaView>

        {/* Detection chips */}
        {detectedItems.length > 0 && (
          <View style={styles.detectionList} pointerEvents="none">
            {detectedItems.map((item, idx) => (
              <View key={`det-${idx}`} style={styles.detectionChip}>
                <Ionicons name="checkmark-circle" size={14} color="#4CAF50" style={{ marginRight: 4 }} />
                <Text style={styles.detectionChipText}>
                  {getDisplayName(item.label)}
                </Text>
                <Text style={styles.detectionChipScore}>
                  {Math.round(item.confidence * 100)}%
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Powered by badge */}
        <View style={styles.poweredBadge} pointerEvents="none">
          <Ionicons name="sparkles" size={12} color="#A78BFA" />
          <Text style={styles.poweredText}>Powered by Gemini Vision AI</Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Toggle scanning */}
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setIsScanning((s) => !s)}
          >
            <Ionicons name={isScanning ? 'pause' : 'play'} size={18} color="#fff" />
            <Text style={styles.toggleButtonText}>
              {isScanning ? 'Pause' : 'Resume'}
            </Text>
          </TouchableOpacity>

          {/* Capture button */}
          <TouchableOpacity
            style={[styles.captureButton, isAnalyzing && { opacity: 0.5 }]}
            onPress={handleCapture}
            disabled={isAnalyzing}
          >
            <View style={styles.captureButtonInner}>
              <Ionicons name="scan" size={28} color="#333" />
            </View>
          </TouchableOpacity>

          {/* Placeholder for symmetry */}
          <View style={{ width: 60 }} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0a0a12',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Permission
  permissionText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  grantButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  grantButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    color: '#aaa',
    fontSize: 14,
  },

  // Analyzing overlay
  analyzingOverlay: {
    position: 'absolute',
    top: '42%' as any,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
    zIndex: 10,
  },
  analyzingText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 0 : 12,
  },
  topBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Powered by badge
  poweredBadge: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 150 : 120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  poweredText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '500',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  toggleButton: {
    width: 60,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    gap: 2,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Detection list
  detectionList: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  detectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  detectionChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
  },
  detectionChipScore: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
  },
});
