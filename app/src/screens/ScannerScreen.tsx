import React, { useRef, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { uploadScanImage } from '../services/apiService';
import { CameraView, CameraViewRef } from '../components/scanner/CameraView';
import { BoundingBoxOverlay } from '../components/scanner/BoundingBoxOverlay';
import { ProductConfirmCard } from '../components/scanner/ProductConfirmCard';
import { ScanProgressBar } from '../components/scanner/ScanProgressBar';
import { useScannerPipeline } from '../hooks/useScannerPipeline';
import { useObjectTracker } from '../hooks/useObjectTracker';
import { useProductIdentifier } from '../hooks/useProductIdentifier';
import { useScannerStore } from '../store/scannerStore';
import { TrackedObject } from '../utils/scannerTypes';

const SCAN_INTERVAL_MS = 300;

export function ScannerScreen() {
  const cameraRef = useRef<CameraViewRef>(null);
  const isProcessingRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);

  const pipeline = useScannerPipeline();
  const tracker = useObjectTracker();
  const identifier = useProductIdentifier();

  const {
    state,
    setState,
    trackedObjects,
    updateTrackedObjects,
    pendingConfirmation,
    confirmProduct,
    dismissProduct,
  } = useScannerStore();

  // Scanning loop
  useEffect(() => {
    if (!isScanning || !pipeline.isReady) return;

    const interval = setInterval(async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const photoUri = await cameraRef.current?.takePhoto();
        if (!photoUri) return;

        const detections = await pipeline.detect(photoUri);
        const updated = tracker.updateWithDetections(detections);
        updateTrackedObjects(updated);

        // Try to identify new unidentified objects
        const unidentified = updated.filter(
          (obj) => !obj.identificationAttempted && obj.framesSinceLastSeen === 0
        );

        for (const obj of unidentified) {
          identifier.identify(photoUri, obj);
        }
      } catch (e) {
        console.warn('Scan loop error:', e);
      } finally {
        isProcessingRef.current = false;
      }
    }, SCAN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isScanning, pipeline.isReady, pipeline.detect, tracker, updateTrackedObjects, identifier]);

  const handleStartScan = useCallback(() => {
    setState('scanning');
    setIsScanning(true);
  }, [setState]);

  const [isUploading, setIsUploading] = useState(false);

  const captureWebFrame = useCallback(async (): Promise<string | null> => {
    // Directly grab from the <video> element on web
    if (Platform.OS !== 'web') return null;
    try {
      const videoEl = document.querySelector('video');
      if (!videoEl) { console.warn('No <video> element found'); return null; }
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return new Promise<string | null>((resolve) => {
        canvas.toBlob(
          (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
          'image/jpeg',
          0.8,
        );
      });
    } catch (e) {
      console.warn('Web frame capture failed:', e);
      return null;
    }
  }, []);

  const handleStopScan = useCallback(async () => {
    setState('idle');
    setIsScanning(false);

    try {
      setIsUploading(true);

      // Try the CameraView ref first, then fall back to direct web capture
      let photoUri = await cameraRef.current?.takePhoto();
      console.log('takePhoto result:', photoUri ? 'got URI' : 'null');

      if (!photoUri) {
        console.log('Falling back to direct web capture...');
        photoUri = await captureWebFrame();
        console.log('Web capture result:', photoUri ? 'got URI' : 'null');
      }

      if (!photoUri) {
        const msg = 'Could not capture image from camera. Make sure camera permission is granted.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Capture Failed', msg);
        setIsUploading(false);
        return;
      }

      console.log('Uploading scan image...');
      const result = await uploadScanImage(photoUri);
      console.log('Scan uploaded:', JSON.stringify(result, null, 2));

      if (Platform.OS === 'web') {
        window.alert('Scan saved to database!');
      } else {
        Alert.alert('Scan Saved', 'Image uploaded and saved to the database.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      console.error('Scan upload error:', msg);
      if (Platform.OS === 'web') {
        window.alert('Upload failed: ' + msg);
      } else {
        Alert.alert('Upload Failed', msg);
      }
    } finally {
      setIsUploading(false);
    }
  }, [setState, captureWebFrame]);

  // Loading state while models download
  if (!pipeline.isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading AI models...</Text>
        {pipeline.downloadProgress > 0 && pipeline.downloadProgress < 1 && (
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${pipeline.downloadProgress * 100}%` },
              ]}
            />
          </View>
        )}
        {pipeline.error && (
          <Text style={styles.errorText}>{pipeline.error.message}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} isActive={true}>
        <BoundingBoxOverlay trackedObjects={trackedObjects} />

        <ScanProgressBar
          detected={trackedObjects.length}
          confirmed={trackedObjects.filter((o) => o.productInfo?.confirmed).length}
        />

        <View style={styles.controls}>
          {isUploading ? (
            <View style={[styles.scanButton, { flexDirection: 'row', gap: 8 }]}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.scanButtonText}>Uploading…</Text>
            </View>
          ) : !isScanning ? (
            <TouchableOpacity style={styles.scanButton} onPress={handleStartScan}>
              <Text style={styles.scanButtonText}>Start Scan</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.scanButton, styles.stopButton]}
              onPress={handleStopScan}
            >
              <Text style={styles.scanButtonText}>Stop & Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </CameraView>

      {pendingConfirmation && (
        <ProductConfirmCard
          trackedObject={pendingConfirmation}
          onConfirm={confirmProduct}
          onDismiss={dismissProduct}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  progressBar: {
    width: '80%',
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 32,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
