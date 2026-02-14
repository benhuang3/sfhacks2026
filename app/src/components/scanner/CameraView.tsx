import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { CameraView as ExpoCameraView, useCameraPermissions } from 'expo-camera';

export interface CameraViewRef {
  takePhoto: () => Promise<string | null>;
}

interface CameraViewProps {
  isActive: boolean;
  children?: React.ReactNode;
}

/**
 * Capture a frame from a <video> element via canvas (web fallback).
 */
function captureFrameFromVideo(videoEl: HTMLVideoElement): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          resolve(URL.createObjectURL(blob));
        },
        'image/jpeg',
        0.8
      );
    } catch {
      resolve(null);
    }
  });
}

export const CameraView = forwardRef<CameraViewRef, CameraViewProps>(
  ({ isActive, children }, ref) => {
    const cameraRef = useRef<any>(null);
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
      if (!permission) return;
      if (!permission.granted) {
        requestPermission();
      }
    }, [permission, requestPermission]);

    const takePhoto = useCallback(async (): Promise<string | null> => {
      if (!cameraRef.current) return null;

      // Try native takePictureAsync first
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (photo?.uri) return photo.uri;
      } catch {
        // Fall through to web fallback
      }

      // Web fallback: find the <video> element inside the camera view and capture a frame
      if (Platform.OS === 'web') {
        try {
          const container = (cameraRef.current as any)?._nativeRef?.current
            ?? document.querySelector('video');
          const videoEl = container instanceof HTMLVideoElement
            ? container
            : container?.querySelector?.('video');
          if (videoEl) return captureFrameFromVideo(videoEl);
        } catch {
          // ignore
        }
      }

      return null;
    }, []);

    useImperativeHandle(ref, () => ({ takePhoto }), [takePhoto]);

    if (!permission || !permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>Camera permission is required to scan appliances.</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ExpoCameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back">
          {children}
        </ExpoCameraView>
      </View>
    );
  }
);

CameraView.displayName = 'CameraView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
