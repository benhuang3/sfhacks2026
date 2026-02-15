/**
 * CameraScanScreen.tsx — Expo Go Compatible Camera Scan & Upload
 *
 * Flow:
 *   1. Request camera permission
 *   2. Show live camera preview (expo-camera CameraView)
 *   3. User taps capture → photo taken
 *   4. Preview shown with Retake / Confirm buttons
 *   5. On confirm → convert to multipart/form-data → POST to FastAPI /scan
 *   6. Handle loading / success / error states
 *
 * Works inside Expo Go — no bare workflow required.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadScanImage } from '../services/apiService';
import { log } from '../utils/logger';
import { Ionicons } from '@expo/vector-icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'camera' | 'preview' | 'uploading';

interface ScanResult {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CameraScanScreenProps {
  onBack?: () => void;
  onResult?: (result: ScanResult) => void;
  onScanComplete?: (scanData: any, imageUri?: string) => void;
}

export function CameraScanScreen({ onBack, onResult, onScanComplete }: CameraScanScreenProps) {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  // ── Capture photo ──────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    log.scan('Capture button pressed');
    if (!cameraRef.current) return;

    let uri: string | null = null;

    // Try native takePictureAsync first
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: false,
      });
      if (photo?.uri) uri = photo.uri;
    } catch {
      // Fall through to web fallback
    }

    // Web fallback: capture from <video> element via canvas
    if (!uri && Platform.OS === 'web') {
      try {
        const videoEl = document.querySelector('video');
        if (videoEl) {
          const canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth || 640;
          canvas.height = videoEl.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            uri = await new Promise<string | null>((resolve) => {
              canvas.toBlob(
                (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
                'image/jpeg',
                0.8
              );
            });
          }
        }
      } catch {
        // ignore web fallback errors
      }
    }

    if (uri) {
      log.scan('Photo captured successfully');
      setPhotoUri(uri);
      setPhase('preview');
      setError(null);
    } else {
      log.error('scan', 'Failed to capture photo — no URI returned');
      setError('Failed to capture photo. Please try again.');
    }
  }, []);

  // ── Retake ─────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    log.scan('Retake pressed');
    setPhotoUri(null);
    setPhase('camera');
    setError(null);
    setResult(null);
  }, []);

  // ── Confirm & Upload ──────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!photoUri) return;

    setPhase('uploading');
    setError(null);

    log.scan('Confirm & upload pressed');
    try {
      const data = await uploadScanImage(photoUri);
      log.scan('Scan result received', data);
      const scanData = (data?.data ?? data) as ScanResult;
      setResult(scanData);
      onResult?.(scanData);
      // Navigate to confirm screen if callback provided
      if (onScanComplete) {
        onScanComplete(scanData, photoUri);
      } else {
        if (Platform.OS === 'web') {
          window.alert('Scan Complete: Appliance identified successfully!');
        } else {
          Alert.alert('Scan Complete', 'Appliance identified successfully!');
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Upload failed. Please try again.';
      log.error('scan', 'Upload failed', err);
      setError(message);
    } finally {
      setPhase('preview');
    }
  }, [photoUri, onResult, onScanComplete]);

  // ── Permission not yet determined ──────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // ── Permission denied ─────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.permissionText}>
          Camera access is needed to scan appliances.
        </Text>
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

  // ── Preview + Upload phase ────────────────────────────────────────────
  if (phase === 'preview' || phase === 'uploading') {
    return (
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>
            {result ? 'Scan Complete' : 'Confirm Photo'}
          </Text>
        </View>

        {/* Photo preview */}
        <View style={styles.previewImageContainer}>
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}

          {/* Loading overlay */}
          {phase === 'uploading' && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Analyzing appliance…</Text>
            </View>
          )}
        </View>

        {/* Error message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}><Ionicons name="warning-outline" size={14} color="#ff6b6b" /> {error}</Text>
          </View>
        )}

        {/* Result display */}
        {result && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>Detected Appliance</Text>
            {Object.entries(result).map(([key, value]) => (
              <View key={key} style={styles.resultRow}>
                <Text style={styles.resultKey}>{key}</Text>
                <Text style={styles.resultValue}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.previewActions}>
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={handleRetake}
            disabled={phase === 'uploading'}
          >
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>

          {!result && (
            <TouchableOpacity
              style={[
                styles.confirmButton,
                phase === 'uploading' && styles.disabledButton,
              ]}
              onPress={handleConfirm}
              disabled={phase === 'uploading'}
            >
              <Text style={styles.confirmButtonText}>
                {phase === 'uploading' ? 'Uploading…' : 'Confirm & Scan'}
              </Text>
            </TouchableOpacity>
          )}

          {result && (
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleRetake}
            >
              <Text style={styles.confirmButtonText}>Scan Another</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera phase ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Viewfinder overlay */}
        <View style={styles.cameraOverlay}>
          {/* Top bar */}
          <SafeAreaView style={styles.topBar}>
            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.topBackButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            <Text style={styles.cameraHint}>Point at an appliance</Text>
          </SafeAreaView>

          {/* Viewfinder frame */}
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {/* Capture button */}
          <View style={styles.captureContainer}>
            <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CORNER_SIZE = 32;
const CORNER_BORDER = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // ── Permission ──────────────────────────────────────────────────────
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

  // ── Camera ──────────────────────────────────────────────────────────
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
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
  cameraHint: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Viewfinder ──────────────────────────────────────────────────────
  viewfinder: {
    width: 260,
    height: 260,
    alignSelf: 'center',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderColor: '#4CAF50',
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderColor: '#4CAF50',
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderColor: '#4CAF50',
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderColor: '#4CAF50',
  },

  // ── Capture button ──────────────────────────────────────────────────
  captureContainer: {
    alignItems: 'center',
    paddingBottom: 48,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },

  // ── Preview ─────────────────────────────────────────────────────────
  previewHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1a1a2e',
  },
  previewTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewImageContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },

  // ── Error ───────────────────────────────────────────────────────────
  errorContainer: {
    backgroundColor: '#3a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    color: '#f44336',
    fontSize: 14,
    textAlign: 'center',
  },

  // ── Result ──────────────────────────────────────────────────────────
  resultContainer: {
    backgroundColor: '#1a2e1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 200,
  },
  resultTitle: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  resultKey: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  resultValue: {
    color: '#fff',
    fontSize: 13,
    flex: 2,
    textAlign: 'right',
  },

  // ── Actions ─────────────────────────────────────────────────────────
  previewActions: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: '#2a5a2a',
    opacity: 0.7,
  },
});
