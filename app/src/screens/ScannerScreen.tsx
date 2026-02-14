import React, { useRef, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
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

  const handleStopScan = useCallback(() => {
    setState('idle');
    setIsScanning(false);
  }, [setState]);

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
          {!isScanning ? (
            <TouchableOpacity style={styles.scanButton} onPress={handleStartScan}>
              <Text style={styles.scanButtonText}>Start Scan</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.scanButton, styles.stopButton]}
              onPress={handleStopScan}
            >
              <Text style={styles.scanButtonText}>Stop Scan</Text>
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
