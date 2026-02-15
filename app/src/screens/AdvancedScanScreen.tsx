/**
 * AdvancedScanScreen — Camera view with two modes: Basic and Scan Room.
 *
 * Basic mode: Shows bounding boxes. User can tap an object for manual 4-shot
 * capture, or press the shutter button for free 4-shot (no bbox).
 *
 * Scan Room mode: Auto-captures objects that stay visible long enough.
 *
 * All captured devices are added to a queue (via ScanQueueContext) for
 * batch review and processing.
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
  Animated,
  Image,
  Dimensions,
  ScrollView,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useScannerPipeline } from '../hooks/useScannerPipeline';
import { useObjectTracker } from '../hooks/useObjectTracker';
import { useSegmentationOverlay } from '../hooks/useSegmentationOverlay';
import { TrackedObject, QueuedDevice, BBox } from '../utils/scannerTypes';
import { getDisplayName, getCategory } from '../utils/applianceClasses';
import { buildScanDataFromDetections } from '../utils/detectionBridge';
import { OutlineOverlay } from '../components/scanner/OutlineOverlay';
import { cropToBoundingBox } from '../services/imageProcessingService';
import { computeIoU } from '../utils/bboxUtils';
import { useScanQueue } from '../context/ScanQueueContext';
import { log } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MULTI_ANGLE_TARGET = 4;
const SCAN_ROOM_CAPTURE_INTERVAL = 2000;
const ANGLE_DIVERSITY_IOU_THRESHOLD = 0.7;
const ANGLE_DIVERSITY_TIME_THRESHOLD = 3000; // ms

type ScanMode = 'basic' | 'scanroom';
type CaptureState =
  | 'idle'          // default scanning state
  | 'manualCapture' // tapped a bbox, manually capturing 4 angles
  | 'freeCapture'   // pressed shutter without selection, 4 free shots
  | 'categoryPick'; // after 4 free shots, picking a category

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AdvancedScanScreenProps {
  onBack?: () => void;
  onUpload?: () => void;
  onNavigateQueue?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdvancedScanScreen({ onBack, onUpload, onNavigateQueue }: AdvancedScanScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const { queue, addToQueue } = useScanQueue();

  // Detection pipeline
  const pipeline = useScannerPipeline();
  const tracker = useObjectTracker(0.3, 10);
  const segOverlay = useSegmentationOverlay();
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
  const [scanMode, setScanMode] = useState<ScanMode>('basic');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const selectedObjectRef = useRef<TrackedObject | null>(null);
  const [capturedAngles, setCapturedAngles] = useState<string[]>([]);
  const [flashCapture, setFlashCapture] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Free capture: snapshot of detections for category picker
  const [snapshotDetections, setSnapshotDetections] = useState<TrackedObject[]>([]);
  const [categorySearch, setCategorySearch] = useState('');

  // Camera layout
  const [cameraLayout, setCameraLayout] = useState({ width: 1, height: 1 });
  const photoDimsRef = useRef({ width: 640, height: 480 });
  const cameraLayoutRef = useRef({ width: 1, height: 1 });
  const isDetectingRef = useRef(false);
  const isCapturingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emptyFrameCountRef = useRef(0);

  // Scan Room: angle tracking per object
  const scanRoomProgressRef = useRef<Map<string, {
    count: number;
    lastBbox: BBox;
    lastCaptureTime: number;
    images: string[];
    label: string;
    score: number;
  }>>(new Map());

  // Camera layout measurement
  const onCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    cameraLayoutRef.current = { width, height };
    setCameraLayout({ width, height });
  }, []);

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMessage(null));
  }, [toastAnim]);

  // ---------------------------------------------------------------------------
  // Detection loop
  // ---------------------------------------------------------------------------
  const runDetection = useCallback(async () => {
    if (isDetectingRef.current || isCapturingRef.current || !pipeline.isReady || !cameraRef.current) return;

    isDetectingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, base64: false, exif: false });
      if (!photo?.uri) return;

      if (photo.width && photo.height) {
        photoDimsRef.current = { width: photo.width, height: photo.height };
      }

      const detections = await pipeline.detect(photo.uri);
      const tracked = updateWithDetectionsRef.current(detections);
      setTrackedObjects(tracked);

      if (tracked.length > 0) {
        segRequestRef.current(
          photo.uri, tracked,
          photoDimsRef.current.width, photoDimsRef.current.height,
          cameraLayoutRef.current.width, cameraLayoutRef.current.height
        );
      }

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

  // Resume scanning on focus
  useEffect(() => {
    if (isFocused) {
      setIsScanning(true);
      emptyFrameCountRef.current = 0;
      setIsStubMode(false);
    }
  }, [isFocused]);

  // Detection interval
  useEffect(() => {
    if (isScanning && isFocused && pipeline.isReady && captureState === 'idle') {
      intervalRef.current = setInterval(runDetection, 800);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isScanning, isFocused, pipeline.isReady, runDetection, captureState]);

  // ---------------------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------------------
  const handleModeSwitch = useCallback((mode: ScanMode) => {
    setScanMode(mode);
    setCaptureState('idle');
    setSelectedObjectId(null);
    selectedObjectRef.current = null;
    setCapturedAngles([]);
    setSnapshotDetections([]);
    scanRoomProgressRef.current.clear();
    setIsScanning(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Basic Mode — Sub-flow A: Tap object → manual 4-shot
  // ---------------------------------------------------------------------------
  const handleObjectPress = useCallback((obj: TrackedObject) => {
    if (isCapturingRef.current || captureState !== 'idle' || scanMode !== 'basic') return;
    log.scan(`Object tapped: ${obj.label} (${obj.id}) — entering manual capture`);
    selectedObjectRef.current = obj;
    setSelectedObjectId(obj.id);
    setCaptureState('manualCapture');
    setCapturedAngles([]);
  }, [captureState, scanMode]);

  const cancelManualCapture = useCallback(() => {
    setCaptureState('idle');
    setSelectedObjectId(null);
    selectedObjectRef.current = null;
    setCapturedAngles([]);
    log.scan('Manual capture cancelled');
  }, []);

  // ---------------------------------------------------------------------------
  // Shutter press — manual capture angle or enter free capture
  // ---------------------------------------------------------------------------
  const handleShutterPress = useCallback(async () => {
    if (!cameraRef.current || isCapturingRef.current || isDetectingRef.current) return;

    // Sub-flow A: in manual capture mode, capture an angle
    if (captureState === 'manualCapture' && selectedObjectRef.current) {
      isCapturingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false, exif: false });
        if (!photo?.uri) return;

        // Re-detect to update bbox
        let cropBbox = selectedObjectRef.current.bbox;
        try {
          const detections = await pipelineDetectRef.current(photo.uri);
          if (detections.length > 0) {
            let bestMatch = null;
            let bestIou = 0;
            for (const det of detections) {
              const iou = computeIoU(selectedObjectRef.current.bbox, det.bbox);
              const labelBonus = det.label === selectedObjectRef.current.label ? 0.2 : 0;
              const score = iou + labelBonus;
              if (score > bestIou) {
                bestIou = score;
                bestMatch = det;
              }
            }
            if (bestMatch && bestIou >= 0.1) {
              cropBbox = bestMatch.bbox;
              selectedObjectRef.current = { ...selectedObjectRef.current, bbox: bestMatch.bbox, score: bestMatch.score };
              setTrackedObjects((prev) =>
                prev.map((t) =>
                  t.id === selectedObjectRef.current!.id
                    ? { ...t, bbox: bestMatch!.bbox, score: bestMatch!.score, framesSinceLastSeen: 0 }
                    : t
                )
              );
            }
          }
        } catch {}

        const croppedUri = await cropToBoundingBox(photo.uri, cropBbox, photo.width, photo.height, 0.15);

        // Flash
        setFlashCapture(true);
        setTimeout(() => setFlashCapture(false), 200);

        setCapturedAngles((prev) => {
          const updated = [...prev, croppedUri];

          if (updated.length >= MULTI_ANGLE_TARGET) {
            const obj = selectedObjectRef.current!;
            const scanData = buildScanDataFromDetections(
              [obj, ...trackedObjects.filter((t) => t.id !== obj.id)],
              updated[0],
              { width: photo.width, height: photo.height },
              obj.id
            );

            const device: QueuedDevice = {
              id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              label: getDisplayName(obj.label),
              confidence: obj.score,
              bbox: obj.bbox,
              angleImages: updated,
              primaryImage: updated[0],
              scanData,
            };

            // Defer side effects out of state updater to avoid
            // "Cannot update ScanQueueProvider while rendering AdvancedScanScreen"
            setTimeout(() => {
              addToQueue(device);
              showToast(`${getDisplayName(obj.label)} added to queue`);
              setCaptureState('idle');
              setSelectedObjectId(null);
              selectedObjectRef.current = null;
              setCapturedAngles([]);
            }, 0);
          }

          return updated;
        });
      } catch (err) {
        log.error('scan', 'Manual capture failed', err);
      } finally {
        isCapturingRef.current = false;
      }
      return;
    }

    // Sub-flow B: free capture — no object selected, take full-frame photos
    if (captureState === 'freeCapture') {
      isCapturingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false, exif: false });
        if (!photo?.uri) return;

        setFlashCapture(true);
        setTimeout(() => setFlashCapture(false), 200);

        setCapturedAngles((prev) => {
          const updated = [...prev, photo.uri];
          if (updated.length >= MULTI_ANGLE_TARGET) {
            setTimeout(() => setCaptureState('categoryPick'), 100);
          }
          return updated;
        });
      } catch (err) {
        log.error('scan', 'Free capture failed', err);
      } finally {
        isCapturingRef.current = false;
      }
      return;
    }

    // Enter free capture mode (idle → freeCapture)
    if (captureState === 'idle' && scanMode === 'basic') {
      setSnapshotDetections([...trackedObjects]);
      setIsScanning(false);
      setCaptureState('freeCapture');
      setCapturedAngles([]);
      log.scan('Entering free capture mode');
    }
  }, [captureState, scanMode, trackedObjects, addToQueue, showToast]);

  // ---------------------------------------------------------------------------
  // Category picker (after free capture completes)
  // ---------------------------------------------------------------------------
  const handleCategorySelect = useCallback((label: string, confidence: number) => {
    if (capturedAngles.length === 0) return;

    const scanData = buildScanDataFromDetections(
      [{ id: 'free', bbox: { x1: 0, y1: 0, x2: 1, y2: 1 }, label, score: confidence, framesSinceLastSeen: 0, identificationAttempted: false }],
      capturedAngles[0],
    );

    const device: QueuedDevice = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: getDisplayName(label),
      confidence,
      bbox: { x1: 0, y1: 0, x2: 1, y2: 1 },
      angleImages: capturedAngles,
      primaryImage: capturedAngles[0],
      scanData,
    };

    addToQueue(device);
    showToast(`${getDisplayName(label)} added to queue`);

    setCaptureState('idle');
    setCapturedAngles([]);
    setSnapshotDetections([]);
    setCategorySearch('');
    setIsScanning(true);
  }, [capturedAngles, addToQueue, showToast]);

  const cancelFreeCapture = useCallback(() => {
    setCaptureState('idle');
    setCapturedAngles([]);
    setSnapshotDetections([]);
    setCategorySearch('');
    setIsScanning(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Scan Room mode — auto-capture effect
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (scanMode !== 'scanroom' || !pipeline.isReady || !cameraRef.current || !isFocused) return;

    const captureInterval = setInterval(async () => {
      if (isCapturingRef.current || isDetectingRef.current || !cameraRef.current) return;

      const visible = trackedObjects.filter((o) => o.framesSinceLastSeen === 0);
      if (visible.length === 0) return;

      isCapturingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false, exif: false });
        if (!photo?.uri) return;

        const progress = scanRoomProgressRef.current;
        const now = Date.now();

        for (const obj of visible) {
          let entry = progress.get(obj.id);
          if (!entry) {
            entry = { count: 0, lastBbox: obj.bbox, lastCaptureTime: 0, images: [], label: obj.label, score: obj.score };
            progress.set(obj.id, entry);
          }

          // Already queued
          if (entry.count >= MULTI_ANGLE_TARGET) continue;

          // Check angle diversity
          const iou = computeIoU(entry.lastBbox, obj.bbox);
          const timeSinceLast = now - entry.lastCaptureTime;
          if (iou >= ANGLE_DIVERSITY_IOU_THRESHOLD && timeSinceLast < ANGLE_DIVERSITY_TIME_THRESHOLD) {
            continue; // Not a new angle
          }

          // Crop and store
          const croppedUri = await cropToBoundingBox(photo.uri, obj.bbox, photo.width, photo.height, 0.15);
          entry.images.push(croppedUri);
          entry.count += 1;
          entry.lastBbox = obj.bbox;
          entry.lastCaptureTime = now;
          entry.score = Math.max(entry.score, obj.score);

          // Check if complete
          if (entry.count >= MULTI_ANGLE_TARGET) {
            const scanData = buildScanDataFromDetections(
              [obj],
              entry.images[0],
              { width: photo.width, height: photo.height },
              obj.id
            );

            const device: QueuedDevice = {
              id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              label: getDisplayName(obj.label),
              confidence: entry.score,
              bbox: obj.bbox,
              angleImages: entry.images,
              primaryImage: entry.images[0],
              scanData,
            };

            addToQueue(device);
            showToast(`${getDisplayName(obj.label)} auto-captured`);
          }
        }
      } catch (err) {
        log.error('scan', 'Scan room capture error', err);
      } finally {
        isCapturingRef.current = false;
      }
    }, SCAN_ROOM_CAPTURE_INTERVAL);

    return () => clearInterval(captureInterval);
  }, [scanMode, pipeline.isReady, isFocused, trackedObjects, addToQueue, showToast]);

  // ---------------------------------------------------------------------------
  // Permission screens
  // ---------------------------------------------------------------------------
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.permissionText}>Camera access is needed to scan appliances.</Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
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

  // Model loading
  if (!pipeline.isReady) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingTitle}>Loading AI Model...</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${Math.round(pipeline.downloadProgress * 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>{Math.round(pipeline.downloadProgress * 100)}%</Text>
        {pipeline.error && <Text style={styles.errorText}>Error: {String(pipeline.error)}</Text>}
        {onBack && (
          <TouchableOpacity style={styles.backLink} onPress={onBack}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Category picker overlay (after free capture)
  // ---------------------------------------------------------------------------
  if (captureState === 'categoryPick') {
    const uniqueCategories = new Map<string, number>();
    for (const obj of snapshotDetections) {
      const name = getDisplayName(obj.label);
      if (!uniqueCategories.has(name) || obj.score > uniqueCategories.get(name)!) {
        uniqueCategories.set(name, obj.score);
      }
    }
    const categoryOptions = Array.from(uniqueCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([name]) => !categorySearch || name.toLowerCase().includes(categorySearch.toLowerCase()));

    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.categoryPickTitle}>What did you scan?</Text>
        <Text style={styles.categoryPickSub}>{capturedAngles.length} photos captured</Text>

        {/* Thumbnails */}
        <View style={styles.thumbnailRow}>
          {capturedAngles.slice(0, 4).map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.thumbnail} />
          ))}
        </View>

        <TextInput
          style={styles.categorySearchInput}
          placeholder="Search categories..."
          placeholderTextColor="#666"
          value={categorySearch}
          onChangeText={setCategorySearch}
        />

        <ScrollView style={styles.categoryList} contentContainerStyle={{ paddingBottom: 20 }}>
          {categoryOptions.map(([name, score]) => (
            <TouchableOpacity
              key={name}
              style={styles.categoryOption}
              onPress={() => handleCategorySelect(name.toLowerCase(), score)}
            >
              <Text style={styles.categoryOptionText}>{name}</Text>
              <Text style={styles.categoryOptionScore}>{Math.round(score * 100)}%</Text>
            </TouchableOpacity>
          ))}
          {categoryOptions.length === 0 && (
            <Text style={styles.categoryEmptyText}>No matching categories</Text>
          )}
        </ScrollView>

        <TouchableOpacity style={styles.cancelFreeButton} onPress={cancelFreeCapture}>
          <Text style={styles.cancelFreeButtonText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Main camera view
  // ---------------------------------------------------------------------------
  const applianceCount = trackedObjects.filter((o) => o.framesSinceLastSeen === 0).length;
  const showBboxes = captureState !== 'freeCapture';

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onLayout={onCameraLayout} />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Bounding boxes (hidden in free capture mode) */}
        {showBboxes && (
          <OutlineOverlay
            overlays={[]}
            trackedObjects={trackedObjects}
            photoDims={photoDimsRef.current}
            cameraLayout={cameraLayout}
            onObjectPress={scanMode === 'basic' && captureState === 'idle' ? handleObjectPress : undefined}
            selectedObjectId={selectedObjectId}
          />
        )}

        {/* Flash */}
        {flashCapture && <View style={styles.captureFlash} pointerEvents="none" />}

        {/* Stub mode warning */}
        {isStubMode && (
          <View style={styles.stubBanner}>
            <Text style={styles.stubBannerText}>Detection unavailable — requires a development build</Text>
          </View>
        )}

        {/* Top bar */}
        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.topBackButton}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeButton, scanMode === 'basic' && styles.modeButtonActive]}
              onPress={() => handleModeSwitch('basic')}
            >
              <Text style={[styles.modeButtonText, scanMode === 'basic' && styles.modeButtonTextActive]}>Basic</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, scanMode === 'scanroom' && styles.modeButtonActive]}
              onPress={() => handleModeSwitch('scanroom')}
            >
              <Text style={[styles.modeButtonText, scanMode === 'scanroom' && styles.modeButtonTextActive]}>Scan Room</Text>
            </TouchableOpacity>
          </View>

          {/* Status pill */}
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: isScanning ? '#4CAF50' : '#888' }]} />
            <Text style={styles.statusText}>
              {isScanning
                ? applianceCount > 0 ? `${applianceCount} detected` : 'Scanning...'
                : captureState === 'freeCapture' ? 'Free capture' : 'Paused'}
            </Text>
          </View>
        </SafeAreaView>

        {/* Manual capture overlay */}
        {captureState === 'manualCapture' && (
          <View style={styles.multiAngleOverlay} pointerEvents="none">
            <View style={styles.multiAngleCard}>
              <Text style={styles.multiAngleTitle}>
                {getDisplayName(selectedObjectRef.current?.label ?? '')}
              </Text>
              <Text style={styles.multiAngleInstruction}>Tap shutter to capture angles</Text>
              <View style={styles.progressDots}>
                {Array.from({ length: MULTI_ANGLE_TARGET }).map((_, i) => (
                  <View key={i} style={[styles.progressDot, i < capturedAngles.length && styles.progressDotFilled]} />
                ))}
              </View>
              <Text style={styles.multiAngleCount}>
                {capturedAngles.length} of {MULTI_ANGLE_TARGET} angles
              </Text>
            </View>
          </View>
        )}

        {/* Free capture overlay */}
        {captureState === 'freeCapture' && (
          <View style={styles.multiAngleOverlay} pointerEvents="none">
            <View style={styles.multiAngleCard}>
              <Text style={styles.multiAngleTitle}>Free Capture</Text>
              <Text style={styles.multiAngleInstruction}>Take 4 photos of the appliance</Text>
              <View style={styles.progressDots}>
                {Array.from({ length: MULTI_ANGLE_TARGET }).map((_, i) => (
                  <View key={i} style={[styles.progressDot, i < capturedAngles.length && styles.progressDotFilled]} />
                ))}
              </View>
              <Text style={styles.multiAngleCount}>
                {capturedAngles.length} of {MULTI_ANGLE_TARGET} photos
              </Text>
            </View>
          </View>
        )}

        {/* Scan Room status */}
        {scanMode === 'scanroom' && captureState === 'idle' && (
          <View style={styles.multiAngleOverlay} pointerEvents="none">
            <View style={[styles.multiAngleCard, { paddingVertical: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                  Scanning room... {queue.length > 0 ? `${queue.length} device${queue.length > 1 ? 's' : ''} found` : 'Move around slowly'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Detection chips (idle basic mode only) */}
        {scanMode === 'basic' && captureState === 'idle' && trackedObjects.length > 0 && (
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
                  <Text style={styles.detectionChipText}>{getDisplayName(obj.label)}</Text>
                  <Text style={styles.detectionChipScore}>{Math.round(obj.score * 100)}%</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          {/* Left: Upload button */}
          {captureState === 'idle' ? (
            <TouchableOpacity style={styles.toggleButton} onPress={onUpload}>
              <Ionicons name="images-outline" size={18} color="#fff" />
              <Text style={styles.toggleButtonText}>Upload</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.cancelButton} onPress={captureState === 'manualCapture' ? cancelManualCapture : cancelFreeCapture}>
              <Ionicons name="close" size={18} color="#fff" />
              <Text style={styles.toggleButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {/* Center: Shutter or Done */}
          {scanMode === 'basic' ? (
            <TouchableOpacity style={styles.captureButton} onPress={handleShutterPress}>
              <View style={styles.captureButtonInner}>
                <Ionicons name="scan" size={28} color="#333" />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.captureButton, { borderColor: '#4CAF50' }]}
              onPress={onNavigateQueue}
            >
              <View style={[styles.captureButtonInner, { backgroundColor: '#4CAF50' }]}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Done</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Right: Queue badge */}
          <TouchableOpacity style={styles.queueBadgeButton} onPress={onNavigateQueue}>
            <Ionicons name="list-outline" size={18} color="#fff" />
            {queue.length > 0 && (
              <View style={styles.queueCountBadge}>
                <Text style={styles.queueCountText}>{queue.length}</Text>
              </View>
            )}
            <Text style={styles.toggleButtonText}>Queue</Text>
          </TouchableOpacity>
        </View>

        {/* Toast */}
        {toastMessage && (
          <Animated.View style={[styles.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1, backgroundColor: '#0a0a12',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },

  // Permission
  permissionText: { color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 24, lineHeight: 26 },
  grantButton: { backgroundColor: '#4CAF50', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  grantButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { marginTop: 16 },
  backLinkText: { color: '#aaa', fontSize: 14 },

  // Loading
  loadingTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 16 },
  progressBarBg: { width: '80%', height: 8, backgroundColor: '#2a2a3e', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 4 },
  progressText: { color: '#888', fontSize: 14, marginTop: 8 },
  errorText: { color: '#ff4444', fontSize: 14, marginTop: 12, textAlign: 'center' },

  // Stub
  stubBanner: {
    position: 'absolute', top: '40%' as any, left: 24, right: 24,
    backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, padding: 16, alignItems: 'center', zIndex: 10,
  },
  stubBannerText: { color: '#FFC107', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // Top bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 0 : 12, gap: 8,
  },
  topBackButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16, overflow: 'hidden',
  },
  modeButton: {
    paddingHorizontal: 14, paddingVertical: 6,
  },
  modeButtonActive: {
    backgroundColor: '#4CAF50', borderRadius: 16,
  },
  modeButtonText: {
    color: '#aaa', fontSize: 13, fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },

  // Status
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  toggleButton: {
    width: 60, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', gap: 2,
  },
  toggleButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureButtonInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
  },
  cancelButton: {
    width: 60, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(255,0,0,0.5)', alignItems: 'center', gap: 2,
  },

  // Queue badge
  queueBadgeButton: {
    width: 60, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', gap: 2,
  },
  queueCountBadge: {
    position: 'absolute', top: -4, right: 4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
  },
  queueCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Detection chips
  detectionList: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 110 : 80,
    left: 0, right: 0, flexDirection: 'row', justifyContent: 'center',
    flexWrap: 'wrap', gap: 8, paddingHorizontal: 16,
  },
  detectionChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#4CAF50',
  },
  detectionChipText: { color: '#fff', fontSize: 13, fontWeight: '600', marginRight: 4 },
  detectionChipScore: { color: '#4CAF50', fontSize: 12, fontWeight: '700' },

  // Multi-angle / free capture overlay
  captureFlash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.3)', zIndex: 20 },
  multiAngleOverlay: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 140 : 110,
    left: 0, right: 0, alignItems: 'center',
  },
  multiAngleCard: {
    backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 16,
    paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center', marginHorizontal: 32,
  },
  multiAngleTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  multiAngleInstruction: { color: '#aaa', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  progressDots: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  progressDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: '#4CAF50', backgroundColor: 'transparent',
  },
  progressDotFilled: { backgroundColor: '#4CAF50' },
  multiAngleCount: { color: '#888', fontSize: 12 },

  // Toast
  toast: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 100 : 80,
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Category picker
  categoryPickTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  categoryPickSub: { color: '#888', fontSize: 14, marginBottom: 16 },
  thumbnailRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  thumbnail: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#1a1a2e' },
  categorySearchInput: {
    width: '100%', backgroundColor: '#1a1a2e', borderRadius: 12,
    color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 12,
  },
  categoryList: { width: '100%', maxHeight: 300 },
  categoryOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a2e', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 8,
  },
  categoryOptionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  categoryOptionScore: { color: '#4CAF50', fontSize: 14, fontWeight: '700' },
  categoryEmptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 20 },
  cancelFreeButton: {
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cancelFreeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
