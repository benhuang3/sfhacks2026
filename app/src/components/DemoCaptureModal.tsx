/**
 * DemoCaptureModal — Full-screen camera for the "Demo in my space" feature.
 *
 * Clean camera view (no bounding boxes). User points at their space and
 * taps the shutter. The full-frame photo URI is returned via onCapture
 * with bbox [0,0,1,1].
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface DemoCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the captured photo URI and bbox (always full-frame [0,0,1,1]) */
  onCapture: (photoUri: string, bbox: [number, number, number, number]) => void;
  /** Title shown at top */
  title?: string;
}

export function DemoCaptureModal({
  visible,
  onClose,
  onCapture,
  title = 'Capture your space',
}: DemoCaptureModalProps) {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  // Request permission on mount
  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible, permission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        setCapturing(false);
        return;
      }

      onCapture(photo.uri, [0, 0, 1, 1]);
    } catch (e) {
      console.warn('[DemoCapture] Capture failed:', e);
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Permission check */}
        {!permission?.granted ? (
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={48} color="#888" />
            <Text style={styles.permissionText}>Camera access needed</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}>
              <Text style={{ color: '#888', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Camera */}
            <View style={styles.cameraContainer}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
              />
            </View>

            {/* Top bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <View style={styles.topCenter}>
                <Text style={styles.topTitle}>{title}</Text>
              </View>
              <View style={{ width: 44 }} />
            </View>

            {/* Instructions */}
            <View style={styles.instructionBar}>
              <Ionicons name="information-circle-outline" size={16} color="#fff" />
              <Text style={styles.instructionText}>
                Point at where you want the product placed, then tap the shutter.
              </Text>
            </View>

            {/* Bottom bar */}
            <View style={styles.bottomBar}>
              <View style={{ flex: 1 }} />

              {/* Shutter button */}
              <TouchableOpacity
                style={[styles.shutterBtn, capturing && styles.shutterBtnDisabled]}
                onPress={handleCapture}
                disabled={capturing}
              >
                {capturing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </TouchableOpacity>

              <View style={{ flex: 1 }} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a12',
  },
  permissionText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  permissionBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  instructionBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 80,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  instructionText: {
    color: '#ddd',
    fontSize: 12,
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shutterBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterBtnDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
});
