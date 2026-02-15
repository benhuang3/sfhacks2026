/**
 * LiveScanScreen — Real-time camera preview with on-device object detection
 * and outline tracing via DeepLabV3 segmentation.
 *
 * SSDLite320 detects objects at ~1-2 FPS. DeepLabV3 generates contour outlines
 * for supported classes (TV). Other classes fall back to bounding box rectangles.
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

import { useScannerPipeline } from '../hooks/useScannerPipeline';
import { useObjectTracker } from '../hooks/useObjectTracker';
import { useSegmentationOverlay } from '../hooks/useSegmentationOverlay';
import { TrackedObject } from '../utils/scannerTypes';
import { getDisplayName } from '../utils/applianceClasses';
import { buildScanDataFromDetections } from '../utils/detectionBridge';
import { OutlineOverlay } from '../components/scanner/OutlineOverlay';
import { cropToBoundingBox } from '../services/imageProcessingService';
import { computeIoU } from '../utils/bboxUtils';
import { log } from '../utils/logger';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const MULTI_ANGLE_TARGET = 4;
const MULTI_ANGLE_INTERVAL_MS = 1500;

interface LiveScanScreenProps {
  onBack?: () => void;
  onCapture?: (scanData: any, imageUri: string) => void;
  onMultiAngleComplete?: (
    scanData: any,
    imageUris: string[],
    primaryUri: string
  ) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveScanScreen({ onBack, onCapture, onMultiAngleComplete }: LiveScanScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();

  // Detection pipeline
  const pipeline = useScannerPipeline();
  const tracker = useObjectTracker(0.3, 10);
  const segOverlay = useSegmentationOverlay();
  // Stable refs so effects always call the latest version of these functions
  const pipelineDetectRef = useRef(pipeline.detect);
  pipelineDetectRef.current = pipeline.detect;
  const updateWithDetectionsRef = useRef(tracker.updateWithDetections);
  updateWithDetectionsRef.current = tracker.updateWithDetections;
  const segRequestRef = useRef(segOverlay.requestSegmentation);
  segRequestRef.current = segOverlay.requestSegmentation;

  // State
  const [trackedObjects, setTrackedObjects] = useState<TrackedObject[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [isStubMode, setIsStubMode] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [multiAngleMode, setMultiAngleMode] = useState(false);
  const [capturedAngles, setCapturedAngles] = useState<string[]>([]);
  const [flashCapture, setFlashCapture] = useState(false);
  const selectedObjectRef = useRef<TrackedObject | null>(null);
  const [cameraLayout, setCameraLayout] = useState({ width: 1, height: 1 });
  const photoDimsRef = useRef({ width: 640, height: 480 });
  const cameraLayoutRef = useRef({ width: 1, height: 1 });
  const isDetectingRef = useRef(false);
  const isCapturingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emptyFrameCountRef = useRef(0);

  // Camera layout measurement
  const onCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    cameraLayoutRef.current = { width, height };
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

      // Trigger segmentation for outline tracing (non-blocking, throttled)
      if (tracked.length > 0) {
        segRequestRef.current(
          photo.uri,
          tracked,
          photoDimsRef.current.width,
          photoDimsRef.current.height,
          cameraLayoutRef.current.width,
          cameraLayoutRef.current.height
        );
      }

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
    if (isFocused) {
      setIsScanning(true);
      emptyFrameCountRef.current = 0;
      setIsStubMode(false);
    }
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
    setSelectedObjectId(null);
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

      const scanData = buildScanDataFromDetections(finalTracked, photo.uri, {
        width: photo.width,
        height: photo.height,
      });
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
  // Object tap — enter multi-angle capture mode
  // ---------------------------------------------------------------------------
  const handleObjectPress = useCallback(
    (obj: TrackedObject) => {
      if (isCapturingRef.current || multiAngleMode) return;
      log.scan(`Object tapped: ${obj.label} (${obj.id}) — entering multi-angle mode`);
      selectedObjectRef.current = obj;
      setSelectedObjectId(obj.id);
      setIsScanning(false); // Pause detection so it doesn't compete for camera
      setMultiAngleMode(true);
      setCapturedAngles([]);
    },
    [multiAngleMode]
  );

  // Cancel multi-angle mode
  const cancelMultiAngle = useCallback(() => {
    setMultiAngleMode(false);
    setSelectedObjectId(null);
    setCapturedAngles([]);
    selectedObjectRef.current = null;
    setIsScanning(true); // Resume detection
    log.scan('Multi-angle mode cancelled');
  }, []);

  // ---------------------------------------------------------------------------
  // Multi-angle auto-capture effect
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!multiAngleMode || !cameraRef.current) return;

    const captureAngle = async () => {
      if (isDetectingRef.current || isCapturingRef.current || !cameraRef.current) return;
      const obj = selectedObjectRef.current;
      if (!obj) return;

      isCapturingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          exif: false,
        });
        if (!photo?.uri) return;

        // Re-detect to get an updated bounding box for this frame.
        // The user may have moved, shifting the object's position.
        let cropBbox = obj.bbox;
        try {
          const detections = await pipelineDetectRef.current(photo.uri);
          log.scan(`Multi-angle re-detect: ${detections.length} detections found`);
          if (detections.length > 0) {
            // Find the detection that best matches the selected object
            // by label match + highest IOU with the last known bbox.
            let bestMatch = null;
            let bestIou = 0;
            for (const det of detections) {
              const iou = computeIoU(obj.bbox, det.bbox);
              // Prefer same label, but accept any match with decent IOU
              const labelBonus = det.label === obj.label ? 0.2 : 0;
              const score = iou + labelBonus;
              if (score > bestIou) {
                bestIou = score;
                bestMatch = det;
              }
            }
            if (bestMatch && bestIou >= 0.1) {
              cropBbox = bestMatch.bbox;
              // Update the ref so subsequent captures track the new position
              selectedObjectRef.current = {
                ...obj,
                bbox: bestMatch.bbox,
                score: bestMatch.score,
              };
              // Update React state so OutlineOverlay re-renders with the new bbox
              setTrackedObjects((prev) =>
                prev.map((t) =>
                  t.id === obj.id
                    ? { ...t, bbox: bestMatch!.bbox, score: bestMatch!.score, framesSinceLastSeen: 0 }
                    : t
                )
              );
              log.scan('Multi-angle re-detect: updated bbox', { iou: bestIou.toFixed(2), label: bestMatch.label });
            } else {
              log.scan('Multi-angle re-detect: no match, using previous bbox');
            }
          }
        } catch (e) {
          // Re-detection failed — use the original bbox
          log.warn('scan', 'Multi-angle re-detect failed, using previous bbox');
        }

        // Crop to bounding box region (with 15% padding)
        const croppedUri = await cropToBoundingBox(
          photo.uri,
          cropBbox,
          photo.width,
          photo.height,
          0.15
        );

        // Flash feedback
        setFlashCapture(true);
        setTimeout(() => setFlashCapture(false), 200);

        setCapturedAngles((prev) => {
          const updated = [...prev, croppedUri];
          log.scan(`Multi-angle capture ${updated.length}/${MULTI_ANGLE_TARGET}`);

          // Check if we've reached the target
          if (updated.length >= MULTI_ANGLE_TARGET) {
            const scanData = buildScanDataFromDetections(
              [obj, ...trackedObjects.filter((t) => t.id !== obj.id)],
              updated[0],
              { width: photo.width, height: photo.height },
              obj.id
            );

            // Schedule navigation for next tick (after state update)
            setTimeout(() => {
              setMultiAngleMode(false);
              setSelectedObjectId(null);
              selectedObjectRef.current = null;
              onMultiAngleComplete?.(scanData, updated, updated[0]);
            }, 100);
          }

          return updated;
        });
      } catch (err) {
        log.error('scan', 'Multi-angle capture failed', err);
      } finally {
        isCapturingRef.current = false;
      }
    };

    const timer = setInterval(captureAngle, MULTI_ANGLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [multiAngleMode, trackedObjects, onMultiAngleComplete]);

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
        {/* Bounding boxes only (outline tracing disabled for now) */}
        <OutlineOverlay
          overlays={[]}
          trackedObjects={trackedObjects}
          photoDims={photoDimsRef.current}
          cameraLayout={cameraLayout}
          onObjectPress={handleObjectPress}
          selectedObjectId={selectedObjectId}
        />

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
              <Ionicons name="arrow-back" size={22} color="#fff" />
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
          {/* Segmentation model download progress */}
          {!segOverlay.isReady && !segOverlay.error && (
            <View style={[styles.statusPill, { marginLeft: 8 }]}>
              <Text style={styles.statusText}>
                Outline: {Math.round(segOverlay.downloadProgress * 100)}%
              </Text>
            </View>
          )}
          {/* Segmentation error indicator */}
          {segOverlay.error && (
            <View style={[styles.statusPill, { marginLeft: 8, backgroundColor: 'rgba(255,0,0,0.6)' }]}>
              <Text style={styles.statusText}>Outline failed</Text>
            </View>
          )}
        </SafeAreaView>

        {/* Multi-angle capture overlay */}
        {multiAngleMode && (
          <>
            {/* Flash feedback on capture */}
            {flashCapture && (
              <View style={styles.captureFlash} pointerEvents="none" />
            )}

            {/* Instruction + progress */}
            <View style={styles.multiAngleOverlay} pointerEvents="none">
              <View style={styles.multiAngleCard}>
                <Text style={styles.multiAngleTitle}>
                  {getDisplayName(selectedObjectRef.current?.label ?? '')}
                </Text>
                <Text style={styles.multiAngleInstruction}>
                  Move around to show different angles
                </Text>
                {/* Progress dots */}
                <View style={styles.progressDots}>
                  {Array.from({ length: MULTI_ANGLE_TARGET }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.progressDot,
                        i < capturedAngles.length && styles.progressDotFilled,
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.multiAngleCount}>
                  {capturedAngles.length} of {MULTI_ANGLE_TARGET} angles captured
                </Text>
              </View>
            </View>

            {/* Cancel button */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={cancelMultiAngle}
              >
                <Ionicons name="close" size={18} color="#fff" />
                <Text style={styles.toggleButtonText}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ width: 72 }} />
              <View style={{ width: 60 }} />
            </View>
          </>
        )}

        {/* Normal mode: Detection chips + bottom controls */}
        {!multiAngleMode && (
          <>
            {/* Detection chips */}
            {trackedObjects.length > 0 && (
              <View style={styles.detectionList} pointerEvents="box-none">
                {trackedObjects
                  .filter((o) => o.framesSinceLastSeen <= 3)
                  .slice(0, 4)
                  .map((obj) => (
                    <TouchableOpacity
                      key={obj.id}
                      style={styles.detectionChip}
                      onPress={() => handleObjectPress(obj)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkmark-circle" size={14} color="#4CAF50" style={{ marginRight: 4 }} />
                      <Text style={styles.detectionChipText}>
                        {getDisplayName(obj.label)}
                      </Text>
                      <Text style={styles.detectionChipScore}>
                        {Math.round(obj.score * 100)}%
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            )}

            {/* Bottom controls */}
            <View style={styles.bottomBar}>
              {/* Toggle scanning */}
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => {
                  setIsScanning((s) => !s);
                  emptyFrameCountRef.current = 0;
                }}
              >
                <Ionicons name={isScanning ? 'pause' : 'play'} size={18} color="#fff" />
                <Text style={styles.toggleButtonText}>
                  {isScanning ? 'Pause' : 'Resume'}
                </Text>
              </TouchableOpacity>

              {/* Capture button */}
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleCapture}
              >
                <View style={styles.captureButtonInner}>
                  <Ionicons name="scan" size={28} color="#333" />
                </View>
              </TouchableOpacity>

              {/* Placeholder for symmetry */}
              <View style={{ width: 60 }} />
            </View>
          </>
        )}
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
    top: '40%' as any,
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

  // Multi-angle capture
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.3)',
    zIndex: 20,
  },
  multiAngleOverlay: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 140 : 110,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  multiAngleCard: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 32,
  },
  multiAngleTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  multiAngleInstruction: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#4CAF50',
    backgroundColor: 'transparent',
  },
  progressDotFilled: {
    backgroundColor: '#4CAF50',
  },
  multiAngleCount: {
    color: '#888',
    fontSize: 12,
  },
  cancelButton: {
    width: 60,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,0,0,0.5)',
    alignItems: 'center',
    gap: 2,
  },
});
