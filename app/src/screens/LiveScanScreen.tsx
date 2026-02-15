/**
 * LiveScanScreen — Real-time camera preview with on-device object detection.
 *
 * Uses react-native-executorch (SSDLite320 MobileNetV3) via useScannerPipeline
 * to detect appliances at ~1-2 FPS and render bounding box overlays.
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

import { useScannerPipeline } from '../hooks/useScannerPipeline';
import { useObjectTracker } from '../hooks/useObjectTracker';
import { TrackedObject } from '../utils/scannerTypes';
import { scaleBBox } from '../utils/bboxUtils';
import { getDisplayName } from '../utils/applianceClasses';
import { buildScanDataFromDetections } from '../utils/detectionBridge';
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

  // Detection pipeline
  const pipeline = useScannerPipeline();
  const tracker = useObjectTracker(0.3, 10);
  // Stable ref to the tracker's update fn (the tracker object itself is new each render)
  const updateWithDetectionsRef = useRef(tracker.updateWithDetections);
  updateWithDetectionsRef.current = tracker.updateWithDetections;

  // State
  const [trackedObjects, setTrackedObjects] = useState<TrackedObject[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [isStubMode, setIsStubMode] = useState(false);
  const [cameraLayout, setCameraLayout] = useState({ width: 1, height: 1 });
  const photoDimsRef = useRef({ width: 640, height: 480 });
  const isDetectingRef = useRef(false);
  const isCapturingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emptyFrameCountRef = useRef(0);

  // Camera layout measurement
  const onCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCameraLayout({ width, height });
  }, []);

  // ---------------------------------------------------------------------------
  // Detection loop with backpressure
  // ---------------------------------------------------------------------------
  const runDetection = useCallback(async () => {
    if (
      isDetectingRef.current ||
      isCapturingRef.current ||
      !pipeline.isReady ||
      !cameraRef.current
    )
      return;

    isDetectingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: false,
        exif: false,
      });
      if (!photo?.uri) return;

      // Track photo dimensions for coordinate mapping
      if (photo.width && photo.height) {
        photoDimsRef.current = { width: photo.width, height: photo.height };
      }

      const detections = await pipeline.detect(photo.uri);
      const tracked = updateWithDetectionsRef.current(detections);
      setTrackedObjects(tracked);

      // Detect stub mode: if we get many consecutive empty frames, the native
      // module is probably stubbed out (Expo Go without dev client).
      if (detections.length === 0) {
        emptyFrameCountRef.current += 1;
        if (emptyFrameCountRef.current >= 8) setIsStubMode(true);
      } else {
        emptyFrameCountRef.current = 0;
        setIsStubMode(false);
      }
    } catch (err) {
      log.error('scan', 'Detection loop error', err);
    } finally {
      isDetectingRef.current = false;
    }
  }, [pipeline.isReady, pipeline.detect]);

  // Resume scanning when screen regains focus (e.g. back from ScanConfirm)
  useEffect(() => {
    if (isFocused) setIsScanning(true);
  }, [isFocused]);

  // Start/stop detection interval (also gated on isFocused)
  useEffect(() => {
    if (isScanning && isFocused && pipeline.isReady) {
      intervalRef.current = setInterval(runDetection, 800);
      log.scan('Detection loop started (800ms interval)');
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isScanning, isFocused, pipeline.isReady, runDetection]);

  // ---------------------------------------------------------------------------
  // Capture — full-res photo + navigate to confirm
  // ---------------------------------------------------------------------------
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturingRef.current) return;

    // Block both capture re-entry and detection loop
    isCapturingRef.current = true;
    setIsScanning(false);
    log.scan('Capture pressed — taking full-res photo');

    // Wait for any in-flight detection to finish
    const waitForDetection = async () => {
      let attempts = 0;
      while (isDetectingRef.current && attempts < 20) {
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }
    };
    await waitForDetection();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: false,
      });
      if (!photo?.uri) {
        isCapturingRef.current = false;
        setIsScanning(true);
        return;
      }

      // Run one final detection on the full-res image
      const detections = await pipeline.detect(photo.uri);
      const finalTracked =
        detections.length > 0
          ? tracker.updateWithDetections(detections)
          : trackedObjects;

      const scanData = buildScanDataFromDetections(finalTracked, photo.uri);
      log.scan('Capture complete', {
        detections: finalTracked.length,
        topLabel: scanData.detected_appliance.name,
      });
      isCapturingRef.current = false;
      onCapture?.(scanData, photo.uri);
    } catch (err) {
      log.error('scan', 'Capture failed', err);
      isCapturingRef.current = false;
      setIsScanning(true); // Resume on failure
    }
  }, [pipeline, tracker, trackedObjects, onCapture]);

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
  // Model loading state
  // ---------------------------------------------------------------------------
  if (!pipeline.isReady) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingTitle}>Loading AI Model...</Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.round(pipeline.downloadProgress * 100)}%`,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {Math.round(pipeline.downloadProgress * 100)}%
        </Text>
        {pipeline.error && (
          <Text style={styles.errorText}>
            Error: {String(pipeline.error)}
          </Text>
        )}
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
  // CameraView must have NO children — overlays go in a sibling View.
  // ---------------------------------------------------------------------------
  const applianceCount = trackedObjects.filter(
    (o) => o.framesSinceLastSeen === 0,
  ).length;

  return (
    <View style={styles.container}>
      {/* Camera preview — no children allowed */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onLayout={onCameraLayout}
      />

      {/* All overlays in a sibling view on top of the camera */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Bounding box overlays */}
        {trackedObjects
          .filter((obj) => obj.framesSinceLastSeen <= 3)
          .map((obj) => {
            const scaled = scaleBBox(
              obj.bbox,
              photoDimsRef.current.width,
              photoDimsRef.current.height,
              cameraLayout.width,
              cameraLayout.height,
            );

            const opacity = obj.framesSinceLastSeen === 0 ? 1 : 0.5;

            return (
              <View
                key={obj.id}
                style={[
                  styles.bboxContainer,
                  {
                    left: scaled.left,
                    top: scaled.top,
                    width: scaled.width,
                    height: scaled.height,
                    opacity,
                    borderColor: obj.identificationAttempted
                      ? '#FFC107'
                      : '#4CAF50',
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.bboxLabel}>
                  <Text style={styles.bboxLabelText}>
                    {getDisplayName(obj.label)} {Math.round(obj.score * 100)}%
                  </Text>
                </View>
              </View>
            );
          })}

        {/* Stub mode warning */}
        {isStubMode && (
          <View style={styles.stubBanner}>
            <Text style={styles.stubBannerText}>
              Detection unavailable — requires a development build
            </Text>
          </View>
        )}

        {/* Top bar */}
        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.topBackButton}>
              <Text style={styles.topBackText}>{'<'}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isScanning ? '#4CAF50' : '#888' },
              ]}
            />
            <Text style={styles.statusText}>
              {isScanning
                ? applianceCount > 0
                  ? `${applianceCount} detected`
                  : 'Scanning...'
                : 'Paused'}
            </Text>
          </View>
        </SafeAreaView>

        {/* Detection chips */}
        {trackedObjects.length > 0 && (
          <View style={styles.detectionList} pointerEvents="none">
            {trackedObjects
              .filter((o) => o.framesSinceLastSeen <= 3)
              .slice(0, 4)
              .map((obj) => (
                <View key={obj.id} style={styles.detectionChip}>
                  <Text style={styles.detectionChipText}>
                    {getDisplayName(obj.label)}
                  </Text>
                  <Text style={styles.detectionChipScore}>
                    {Math.round(obj.score * 100)}%
                  </Text>
                </View>
              ))}
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Toggle scanning */}
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setIsScanning((s) => !s)}
          >
            <Text style={styles.toggleButtonText}>
              {isScanning ? 'Pause' : 'Resume'}
            </Text>
          </TouchableOpacity>

          {/* Capture button */}
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
          >
            <View style={styles.captureButtonInner} />
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

  // Model loading
  loadingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 16,
  },
  progressBarBg: {
    width: '80%',
    height: 8,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },

  // Stub mode banner
  stubBanner: {
    position: 'absolute',
    top: '40%',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  stubBannerText: {
    color: '#FFC107',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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
  topBackText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
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
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 12,
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
  },

  // Bounding boxes
  bboxContainer: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
  },
  bboxLabel: {
    position: 'absolute',
    top: -22,
    left: -1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bboxLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
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
