import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

export interface CameraViewRef {
  takePhoto: () => Promise<string | null>;
}

interface CameraViewProps {
  isActive: boolean;
  children?: React.ReactNode;
}

export const CameraView = forwardRef<CameraViewRef, CameraViewProps>(
  ({ isActive, children }, ref) => {
    const cameraRef = useRef<Camera>(null);
    const device = useCameraDevice('back');
    const { hasPermission, requestPermission } = useCameraPermission();

    useEffect(() => {
      if (!hasPermission) {
        requestPermission();
      }
    }, [hasPermission, requestPermission]);

    const takePhoto = useCallback(async (): Promise<string | null> => {
      if (!cameraRef.current) return null;
      try {
        const photo = await cameraRef.current.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });
        return `file://${photo.path}`;
      } catch {
        return null;
      }
    }, []);

    useImperativeHandle(ref, () => ({ takePhoto }), [takePhoto]);

    if (!hasPermission) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>Camera permission is required to scan appliances.</Text>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>No camera device found.</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isActive}
          photo={true}
        />
        {children}
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
